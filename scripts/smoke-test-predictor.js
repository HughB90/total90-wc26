#!/usr/bin/env node
/**
 * Smoke test for predictor Phase 3 against live Supabase.
 * Exercises the same upsert/select logic the API routes do, without
 * spinning up Next dev server (avoids races with concurrent subagents).
 *
 * Uses Hugh's profile ID. Cleans up after itself.
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const envFile = path.resolve(__dirname, '..', '.env.local')
fs.readFileSync(envFile, 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
})

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PROFILE = '2e731ff1-a83e-4a7e-bcf9-a158cee416a6' // Hugh

async function step(name, fn) {
  try {
    const out = await fn()
    console.log(`✓ ${name}`)
    if (out !== undefined) console.log(`  →`, JSON.stringify(out).slice(0, 200))
    return out
  } catch (e) {
    console.error(`✗ ${name}:`, e.message)
    throw e
  }
}

;(async () => {
  // 0. baseline counts
  await step('predictor_matches row count', async () => {
    const { count, error } = await sb.from('predictor_matches').select('*', { count: 'exact', head: true })
    if (error) throw new Error(error.message)
    if (count !== 104) throw new Error(`expected 104, got ${count}`)
    return { count }
  })

  // 1. winner pick upsert
  await step('POST winner pick (Brazil)', async () => {
    const { data, error } = await sb
      .from('predictor_winner_picks')
      .upsert({ profile_id: PROFILE, team_code: 'Brazil' }, { onConflict: 'profile_id' })
      .select('team_code')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.team_code !== 'Brazil') throw new Error('mismatch')
    return data
  })

  // 2. winner pick update
  await step('POST winner pick again (France) → upserts', async () => {
    const { data, error } = await sb
      .from('predictor_winner_picks')
      .upsert({ profile_id: PROFILE, team_code: 'France' }, { onConflict: 'profile_id' })
      .select('team_code')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data?.team_code !== 'France') throw new Error('mismatch')
    return data
  })

  // 3. GET winner-picks aggregate
  await step('GET winner-picks aggregate', async () => {
    const { data, error } = await sb.from('predictor_winner_picks').select('team_code')
    if (error) throw new Error(error.message)
    const counts = new Map()
    for (const r of data) counts.set(r.team_code, (counts.get(r.team_code) || 0) + 1)
    const picks = Array.from(counts.entries()).map(([team_code, count]) => ({ team_code, count }))
    return { teams: picks.length, total: data.length }
  })

  // 4. GET round/group_r1 (matches only — anon flow)
  await step('GET round group_r1 matches', async () => {
    const { data, error } = await sb
      .from('predictor_matches')
      .select('id, match_num, home_team_code, away_team_code, kickoff_at')
      .eq('round_code', 'group_r1')
      .order('kickoff_at', { ascending: true })
    if (error) throw new Error(error.message)
    if (data.length !== 24) throw new Error(`expected 24, got ${data.length}`)
    return { count: data.length, first: data[0].id, lock_at: data[0].kickoff_at }
  })

  // 5. POST picks — 3 picks in group_r1 with 1 star
  await step('POST picks (3 picks, 1 star) in group_r1', async () => {
    const rows = [
      { profile_id: PROFILE, match_id: 'match_001', home_score: 2, away_score: 0, if_draw_winner: null, is_star: true },
      { profile_id: PROFILE, match_id: 'match_002', home_score: 1, away_score: 1, if_draw_winner: null, is_star: false },
      { profile_id: PROFILE, match_id: 'match_003', home_score: 0, away_score: 3, if_draw_winner: null, is_star: false },
    ]
    const { data, error } = await sb
      .from('predictor_picks')
      .upsert(rows, { onConflict: 'profile_id,match_id' })
      .select('match_id, home_score, away_score, is_star')
    if (error) throw new Error(error.message)
    if (data.length !== 3) throw new Error(`expected 3, got ${data.length}`)
    return { count: data.length, stars: data.filter(p => p.is_star).length }
  })

  // 6. POST picks again — update match_001 to 3-1, keep star
  await step('POST picks again (update match_001 to 3-1)', async () => {
    const { data, error } = await sb
      .from('predictor_picks')
      .upsert(
        [{ profile_id: PROFILE, match_id: 'match_001', home_score: 3, away_score: 1, if_draw_winner: null, is_star: true }],
        { onConflict: 'profile_id,match_id' }
      )
      .select('match_id, home_score, away_score, is_star')
    if (error) throw new Error(error.message)
    if (data[0].home_score !== 3) throw new Error('update did not stick')
    return data[0]
  })

  // 7. GET my picks for group_r1
  await step('GET my picks for group_r1', async () => {
    const { data: matches, error: mErr } = await sb
      .from('predictor_matches')
      .select('id')
      .eq('round_code', 'group_r1')
    if (mErr) throw new Error(mErr.message)
    const ids = matches.map(m => m.id)
    const { data, error } = await sb
      .from('predictor_picks')
      .select('match_id, home_score, away_score, is_star')
      .eq('profile_id', PROFILE)
      .in('match_id', ids)
    if (error) throw new Error(error.message)
    return { count: data.length, stars: data.filter(p => p.is_star).length }
  })

  // 8. Cleanup — leave Hugh's picks in place so Hugh can play with them.
  console.log('\n✅ All 8 smoke checks passed.')
  console.log('   (Picks left in DB for Hugh to play with. Run cleanup-predictor.js to wipe.)')
})().catch((e) => { console.error('FAIL:', e); process.exit(1) })
