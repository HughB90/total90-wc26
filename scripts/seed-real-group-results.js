#!/usr/bin/env node
/**
 * Seed real WC2026 group-stage results into bracket_config.
 *
 * - Pulls all 72 group matches from prod predictor API (group_r1/r2/r3).
 * - Computes standings per group using FIFA tiebreaker rules (pts → GD → GF →
 *   H2H → alphabetic fallback).
 * - Computes the 8 best 3rd-placed teams (pts → GD → GF → alphabetic).
 * - Looks up the FIFA Annex-C bracket allocation for those 8 third-placers.
 * - Writes group_results, third_results, and knockout_results={} into
 *   bracket_config via the Supabase service-role key.
 *
 * Usage:
 *   node scripts/seed-real-group-results.js            # dry-run, prints plan
 *   node scripts/seed-real-group-results.js --commit   # writes to DB
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const PREDICTOR_BASE = process.env.PREDICTOR_BASE_URL || 'https://wc26.total90.com'
const COMMIT = process.argv.includes('--commit')

// WC_GROUPS — must match src/lib/bracket/groups.ts exactly.
const WC_GROUPS = {
  A: ['Mexico', 'South Korea', 'South Africa', 'Czech Republic'],
  B: ['Canada', 'Switzerland', 'Qatar', 'Bosnia and Herzegovina'],
  C: ['Brazil', 'Morocco', 'Scotland', 'Haiti'],
  D: ['USA', 'Australia', 'Paraguay', 'Turkey'],
  E: ['Germany', 'Ecuador', 'Ivory Coast', 'Curacao'],
  F: ['Netherlands', 'Japan', 'Tunisia', 'Sweden'],
  G: ['Belgium', 'Iran', 'Egypt', 'New Zealand'],
  H: ['Spain', 'Uruguay', 'Saudi Arabia', 'Cape Verde'],
  I: ['France', 'Senegal', 'Norway', 'Iraq'],
  J: ['Argentina', 'Austria', 'Algeria', 'Jordan'],
  K: ['Portugal', 'Colombia', 'Uzbekistan', 'DR Congo'],
  L: ['England', 'Croatia', 'Panama', 'Ghana'],
}
const GROUP_LETTERS = Object.keys(WC_GROUPS)

// Normalize predictor team codes to bracket canonical names.
// Predictor uses "Czechia", "Bosnia & Herzegovina"; bracket uses
// "Czech Republic", "Bosnia and Herzegovina". Map both ways.
const NORMALIZE = {
  'Czechia': 'Czech Republic',
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Curaçao': 'Curacao',
}
function norm(code) {
  if (typeof code !== 'string') return code
  return NORMALIZE[code] ?? code
}

// Build set of valid bracket teams for sanity checks
const ALL_BRACKET_TEAMS = new Set()
for (const g of GROUP_LETTERS) for (const t of WC_GROUPS[g]) ALL_BRACKET_TEAMS.add(t)

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return process.env
  const env = { ...process.env }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !env[m[1]]) env[m[1]] = m[2]
  }
  return env
}

async function fetchRound(round) {
  const url = `${PREDICTOR_BASE}/api/predictor/round/${round}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
  const data = await res.json()
  return data.matches ?? []
}

// FIFA tiebreaker: head-to-head between the tied teams only.
// Builds a mini-table among the tied set: pts → GD → GF.
function applyHeadToHead(tiedTeams, matches) {
  const mini = {}
  for (const t of tiedTeams) mini[t] = { pts: 0, gd: 0, gf: 0 }
  const tiedSet = new Set(tiedTeams)
  for (const m of matches) {
    if (!tiedSet.has(m.home) || !tiedSet.has(m.away)) continue
    const dh = m.hs - m.as
    if (dh > 0) mini[m.home].pts += 3
    else if (dh < 0) mini[m.away].pts += 3
    else { mini[m.home].pts += 1; mini[m.away].pts += 1 }
    mini[m.home].gd += dh; mini[m.away].gd -= dh
    mini[m.home].gf += m.hs; mini[m.away].gf += m.as
  }
  // Sort tied teams by mini-table
  return [...tiedTeams].sort((a, b) => {
    if (mini[b].pts !== mini[a].pts) return mini[b].pts - mini[a].pts
    if (mini[b].gd !== mini[a].gd) return mini[b].gd - mini[a].gd
    if (mini[b].gf !== mini[a].gf) return mini[b].gf - mini[a].gf
    return a.localeCompare(b)
  })
}

function computeStandings(groupLetter, matches) {
  const teams = WC_GROUPS[groupLetter]
  const table = {}
  for (const t of teams) table[t] = { team: t, pts: 0, gd: 0, gf: 0, ga: 0 }
  // Normalize match team codes
  const normalized = matches.map(m => ({
    home: norm(m.home_team_code),
    away: norm(m.away_team_code),
    hs: m.home_score, as: m.away_score,
  }))
  for (const m of normalized) {
    if (!table[m.home] || !table[m.away]) continue
    const dh = m.hs - m.as
    if (dh > 0) table[m.home].pts += 3
    else if (dh < 0) table[m.away].pts += 3
    else { table[m.home].pts += 1; table[m.away].pts += 1 }
    table[m.home].gd += dh; table[m.away].gd -= dh
    table[m.home].gf += m.hs; table[m.away].gf += m.as
    table[m.home].ga += m.as; table[m.away].ga += m.hs
  }
  // First pass — overall pts → GD → GF
  let ranked = teams.slice().sort((a, b) => {
    if (table[b].pts !== table[a].pts) return table[b].pts - table[a].pts
    if (table[b].gd !== table[a].gd) return table[b].gd - table[a].gd
    if (table[b].gf !== table[a].gf) return table[b].gf - table[a].gf
    return a.localeCompare(b)
  })
  // Resolve ties via H2H: find runs of equal (pts, gd, gf) and resort with H2H
  const out = []
  let i = 0
  while (i < ranked.length) {
    let j = i + 1
    while (
      j < ranked.length &&
      table[ranked[j]].pts === table[ranked[i]].pts &&
      table[ranked[j]].gd === table[ranked[i]].gd &&
      table[ranked[j]].gf === table[ranked[i]].gf
    ) j++
    if (j - i > 1) {
      const reordered = applyHeadToHead(ranked.slice(i, j), normalized)
      out.push(...reordered)
    } else {
      out.push(ranked[i])
    }
    i = j
  }
  return { order: out, table }
}

async function main() {
  const env = loadEnv()
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // 1. Pull predictor data
  console.log('Pulling group results from', PREDICTOR_BASE)
  const allMatches = []
  for (const r of ['group_r1', 'group_r2', 'group_r3']) {
    const ms = await fetchRound(r)
    console.log(`  ${r}: ${ms.length} matches`)
    allMatches.push(...ms)
  }
  if (allMatches.length !== 72) {
    console.warn(`WARN: expected 72 matches, got ${allMatches.length}`)
  }
  // Sanity: all final?
  const nonFinal = allMatches.filter(m => m.status !== 'final')
  if (nonFinal.length) {
    console.error(`ERROR: ${nonFinal.length} group matches not final — aborting`)
    for (const m of nonFinal.slice(0, 5)) console.error('  ', m.id, m.home_team_code, 'v', m.away_team_code, '→', m.status)
    process.exit(1)
  }

  // Group by group_code
  const byGroup = {}
  for (const g of GROUP_LETTERS) byGroup[g] = []
  for (const m of allMatches) {
    if (m.group_code && byGroup[m.group_code]) byGroup[m.group_code].push(m)
  }
  for (const g of GROUP_LETTERS) {
    if (byGroup[g].length !== 6) console.warn(`  Group ${g}: ${byGroup[g].length} matches (expected 6)`)
  }

  // 2. Compute standings per group
  const groupResults = {}
  const standings = {}
  for (const g of GROUP_LETTERS) {
    const { order, table } = computeStandings(g, byGroup[g])
    groupResults[g] = order
    standings[g] = order.map(t => ({ team: t, ...table[t] }))
  }

  // 3. Compute 8 best 3rd-placed teams.
  // Cross-group ranking: pts → GD → GF → alphabetic.
  const thirds = GROUP_LETTERS.map(g => {
    const team = groupResults[g][2]
    const row = standings[g].find(s => s.team === team)
    return { group: g, team, ...row }
  })
  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    return a.team.localeCompare(b.team)
  })
  const top8Thirds = thirds.slice(0, 8)
  const top8Groups = top8Thirds.map(t => t.group)
  const top8Teams = top8Thirds.map(t => t.team)
  console.log('\nBest 3rd-placed teams (top 8):')
  for (const t of top8Thirds) console.log(`  Group ${t.group}: ${t.team} (${t.pts} pts, GD ${t.gd}, GF ${t.gf})`)

  // 4. Look up FIFA Annex-C allocation
  const allocation = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/lib/bracket/third-allocation.json'), 'utf8'))
  const key = [...top8Groups].sort().join(',')
  const slotGroups = allocation[key]
  if (!slotGroups) {
    console.error(`ERROR: No allocation entry for {${key}} — table has ${Object.keys(allocation).length} entries`)
    process.exit(1)
  }
  // slotGroups is [g0..g7]: the group letter whose 3rd-placer fills each
  // FIFA "winner-vs-3rd" slot (FIFA order: 1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L).
  console.log('\nFIFA Annex-C R32 third-placer allocation:')
  const fifaWinners = ['1A', '1B', '1D', '1E', '1G', '1I', '1K', '1L']
  for (let i = 0; i < 8; i++) {
    const g = slotGroups[i]
    const team = groupResults[g][2]
    console.log(`  ${fifaWinners[i]} vs ${team} (3${g})`)
  }

  // 5. Compose third_results: 8 team names in FIFA slot order (slot 0..7).
  const thirdResultsBySlot = slotGroups.map(g => groupResults[g][2])

  // 6. Write to bracket_config
  console.log('\n--- Plan ---')
  console.log('group_results:', JSON.stringify(groupResults))
  console.log('third_results (FIFA-slot-ordered):', JSON.stringify(thirdResultsBySlot))
  console.log('third_results (alt, ranked top-8 names):', JSON.stringify(top8Teams))
  console.log('knockout_results: {} (initial)')

  if (!COMMIT) {
    console.log('\nDry-run only. Re-run with --commit to write.')
    return
  }

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  async function upsert(key, value) {
    const { error } = await sb.from('bracket_config').upsert({ key, value }, { onConflict: 'key' })
    if (error) throw new Error(`upsert ${key}: ${error.message}`)
    console.log(`  upserted ${key}`)
  }
  console.log('\nWriting to bracket_config…')
  await upsert('group_results', groupResults)
  await upsert('third_results', thirdResultsBySlot)
  // Initial empty knockout_results; admin recompute updates it later.
  const { data: existingKo } = await sb.from('bracket_config').select('value').eq('key', 'knockout_results').maybeSingle()
  if (!existingKo || !existingKo.value || Object.keys(existingKo.value).length === 0) {
    await upsert('knockout_results', {})
  } else {
    console.log('  skip knockout_results (already has data)')
  }
  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
