#!/usr/bin/env node
/**
 * seed-predictor-matches.js
 *
 * Parses the MATCHES array in src/app/scores/page.tsx and upserts every
 * fixture into predictor_matches. Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/seed-predictor-matches.js
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Load .env.local manually (no dotenv dep needed)
const envFile = path.resolve(__dirname, '..', '.env.local')
fs.readFileSync(envFile, 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Parse MATCHES array from scores/page.tsx ─────────────────────────────
const scoresPath = path.resolve(__dirname, '..', 'src', 'app', 'scores', 'page.tsx')
const src = fs.readFileSync(scoresPath, 'utf8')

// Each match row looks like:
//   { num: 1,  stage: 'group', round: 1, group: 'A', date: '2026-06-11', time: '2:00 PM CT',
//     home: t('Mexico'),  away: t('South Africa'),  venue: '...', score: null, status: 'fixture' },
// We extract field-by-field with a regex that captures the inner content of each row.
// venue may be single-quoted or double-quoted (apostrophe in 'Levi's Stadium').
const ROW_RE = /\{\s*num:\s*(\d+)\s*,\s*stage:\s*'([a-z0-9]+)'\s*(?:,\s*round:\s*([123]))?\s*(?:,\s*group:\s*'([A-L])')?\s*,\s*date:\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*time:\s*'([^']+)'\s*,\s*home:\s*[tp]\('([^']+)'\)\s*,\s*away:\s*[tp]\('([^']+)'\)\s*,\s*venue:\s*(?:'([^']+)'|"([^"]+)")/g

const matches = []
let m
while ((m = ROW_RE.exec(src)) !== null) {
  const [, num, stage, round, group, date, time, home, away, venueSingle, venueDouble] = m
  const venue = venueSingle || venueDouble
  matches.push({
    num: parseInt(num, 10),
    stage,
    round: round ? parseInt(round, 10) : null,
    group: group || null,
    date,
    time,
    home,
    away,
    venue,
  })
}

if (matches.length !== 104) {
  console.error(`Expected 104 matches, parsed ${matches.length}. Aborting.`)
  process.exit(1)
}

// ─── Round-code mapping ───────────────────────────────────────────────────
function roundCode(stage, round) {
  if (stage === 'group') return `group_r${round}`
  return stage // r32 | r16 | qf | sf | final
}

// ─── Kickoff → ISO UTC ────────────────────────────────────────────────────
// time looks like '2:00 PM CT' or '11:00 AM CT'. CT during June/July 2026 = CDT = UTC-5.
// (No DST transition in this window — both kickoff and end of WC are firmly in CDT.)
function kickoffToUTC(date, time) {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*CT$/)
  if (!m) throw new Error(`Cannot parse time: ${time}`)
  let hour = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const ampm = m[3]
  if (ampm === 'PM' && hour !== 12) hour += 12
  if (ampm === 'AM' && hour === 12) hour = 0
  // CDT = UTC-5 → add 5 hours to get UTC
  const utcHour = hour + 5
  const [y, mo, d] = date.split('-').map((n) => parseInt(n, 10))
  // Build a UTC Date directly; let it overflow into next day if needed.
  const dt = new Date(Date.UTC(y, mo - 1, d, utcHour, min, 0))
  return dt.toISOString()
}

// ─── Map → DB rows ────────────────────────────────────────────────────────
const rows = matches.map((mt) => ({
  id: `match_${String(mt.num).padStart(3, '0')}`,
  match_num: mt.num,
  round_code: roundCode(mt.stage, mt.round),
  group_code: mt.group,
  home_team_code: mt.home,
  away_team_code: mt.away,
  kickoff_at: kickoffToUTC(mt.date, mt.time),
  venue: mt.venue,
  // home_score / away_score: leave existing values alone on upsert
  status: 'scheduled',
  goalscorers: [],
}))

// ─── Sanity log ───────────────────────────────────────────────────────────
const byRound = rows.reduce((acc, r) => {
  acc[r.round_code] = (acc[r.round_code] || 0) + 1
  return acc
}, {})
console.log('Parsed match counts per round:')
console.log(byRound)
console.log(`First match: ${rows[0].id}  ${rows[0].home_team_code} v ${rows[0].away_team_code}  kickoff ${rows[0].kickoff_at}`)
console.log(`Last  match: ${rows[rows.length - 1].id}  ${rows[rows.length - 1].home_team_code} v ${rows[rows.length - 1].away_team_code}  kickoff ${rows[rows.length - 1].kickoff_at}`)

// ─── Upsert ───────────────────────────────────────────────────────────────
// We upsert on `id` but ONLY overwrite seed fields. We deliberately do NOT
// overwrite home_score / away_score / goalscorers / status — those are
// owned by the scoring engine (Phase 4). So we split: insert new rows OR
// update only the schedule fields if the row already exists.
;(async () => {
  // First: pull existing IDs to figure out which are new vs. existing.
  const { data: existing, error: selErr } = await sb
    .from('predictor_matches')
    .select('id')
  if (selErr) {
    console.error('Failed to read existing rows:', selErr)
    process.exit(1)
  }
  const existingIds = new Set((existing || []).map((r) => r.id))

  const toInsert = rows.filter((r) => !existingIds.has(r.id))
  const toUpdate = rows.filter((r) => existingIds.has(r.id))

  if (toInsert.length) {
    const { error } = await sb.from('predictor_matches').insert(toInsert)
    if (error) {
      console.error('Insert failed:', error)
      process.exit(1)
    }
    console.log(`Inserted ${toInsert.length} new matches.`)
  }

  // For existing rows, only refresh kickoff/venue/teams/round (NOT score/status).
  let updated = 0
  for (const r of toUpdate) {
    const { error } = await sb
      .from('predictor_matches')
      .update({
        match_num: r.match_num,
        round_code: r.round_code,
        group_code: r.group_code,
        home_team_code: r.home_team_code,
        away_team_code: r.away_team_code,
        kickoff_at: r.kickoff_at,
        venue: r.venue,
      })
      .eq('id', r.id)
    if (error) {
      console.error(`Update failed for ${r.id}:`, error)
      process.exit(1)
    }
    updated++
  }
  if (updated) console.log(`Refreshed ${updated} existing matches (schedule fields only).`)

  // Verify final count
  const { count, error: cntErr } = await sb
    .from('predictor_matches')
    .select('*', { count: 'exact', head: true })
  if (cntErr) {
    console.error('Count failed:', cntErr)
    process.exit(1)
  }
  console.log(`✓ predictor_matches total rows: ${count}`)
})()
