/**
 * Idempotent knockout-placeholder resolver.
 *
 * Walks the WC knockout ladder R16 → QF → SF → Final/3rd in order.
 * For every match with a "Winner MX" / "Loser MX" placeholder in
 * home_team_code or away_team_code, resolves it to the actual advancing
 * (or losing) team based on the finalized upstream match. Only writes
 * on drift. Safe to run repeatedly.
 *
 * Additionally cross-checks kickoff_at + venue against Opta MA1 for the
 * knockout rounds and patches any drift there too (opt-out with
 * --no-opta-sync).
 *
 * Usage:
 *   npx tsx scripts/resolve-knockout-placeholders.ts            # apply
 *   npx tsx scripts/resolve-knockout-placeholders.ts --dry      # preview
 *   npx tsx scripts/resolve-knockout-placeholders.ts --no-opta-sync
 *
 * Bracket pairing (WC26): SF1 = QF1 winner vs QF3 winner, SF2 = QF2 winner
 * vs QF4 winner. Because our DB stores placeholders as "Winner MX", we
 * ONLY look at the placeholder string — no assumption about pairing math.
 * That's what saved us on the 2026-07-12 fix: read the placeholder,
 * resolve it, don't infer.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'
import * as https from 'https'
import * as qs from 'querystring'
import * as fs from 'fs'
import * as path from 'path'

config({ path: '.env.local' })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DRY = process.argv.includes('--dry')
const NO_OPTA = process.argv.includes('--no-opta-sync')

const KNOCKOUT_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'] as const
type Round = typeof KNOCKOUT_ORDER[number]

function normalizeTeam(code: string): string {
  const map: Record<string, string> = { USA: 'United States' }
  return map[code] ?? code
}

interface MatchRow {
  id: string
  match_num: number
  round_code: string
  home_team_code: string
  away_team_code: string
  home_score: number | null
  away_score: number | null
  went_to_pks: boolean
  pk_winner_team_code: string | null
  status: string
  kickoff_at: string
  venue: string | null
}

function winnerOf(m: MatchRow): string | null {
  if (m.status !== 'final' || m.home_score === null || m.away_score === null) return null
  if (m.went_to_pks && m.pk_winner_team_code) return m.pk_winner_team_code
  if (m.home_score > m.away_score) return m.home_team_code
  if (m.away_score > m.home_score) return m.away_team_code
  return null
}
function loserOf(m: MatchRow): string | null {
  const w = winnerOf(m)
  if (!w) return null
  return w === m.home_team_code ? m.away_team_code : m.home_team_code
}

async function fetchMatches(round: Round | 'final'): Promise<MatchRow[]> {
  const { data, error } = await sb
    .from('predictor_matches')
    .select('id, match_num, round_code, home_team_code, away_team_code, home_score, away_score, went_to_pks, pk_winner_team_code, status, kickoff_at, venue')
    .eq('round_code', round)
    .order('match_num', { ascending: true })
  if (error) throw error
  return (data as MatchRow[]) || []
}

async function resolvePlaceholders() {
  // Build winner+loser map from every finalized knockout match
  const winMap = new Map<number, string>()
  const loseMap = new Map<number, string>()
  for (const r of KNOCKOUT_ORDER) {
    const rows = await fetchMatches(r)
    for (const m of rows) {
      const w = winnerOf(m); const l = loserOf(m)
      if (w) winMap.set(m.match_num, normalizeTeam(w))
      if (l) loseMap.set(m.match_num, normalizeTeam(l))
    }
  }
  console.log(`Known winners: ${winMap.size}, known losers: ${loseMap.size}`)

  let written = 0, skipped = 0, already = 0
  // Walk each round and rewrite placeholders where upstream is decided
  for (const r of KNOCKOUT_ORDER) {
    const rows = await fetchMatches(r)
    for (const m of rows) {
      const patch: Record<string, string> = {}
      for (const side of ['home_team_code', 'away_team_code'] as const) {
        const val = m[side]
        const wMatch = /^Winner M(\d+)$/.exec(val)
        const lMatch = /^Loser M(\d+)$/.exec(val)
        let resolved: string | null = null
        if (wMatch) resolved = winMap.get(+wMatch[1]) ?? null
        else if (lMatch) resolved = loseMap.get(+lMatch[1]) ?? null
        if (resolved && resolved !== val) patch[side] = resolved
      }
      if (Object.keys(patch).length === 0) {
        // Already resolved (no placeholder left) or still unresolved (upstream pending)
        const hasPlaceholder = /^(Winner|Loser) M\d+$/.test(m.home_team_code) || /^(Winner|Loser) M\d+$/.test(m.away_team_code)
        if (hasPlaceholder) skipped++
        else already++
        continue
      }
      console.log(`M${m.match_num} [${r}]: ${m.home_team_code}/${m.away_team_code} → ${patch.home_team_code ?? m.home_team_code}/${patch.away_team_code ?? m.away_team_code}${DRY ? '  (DRY)' : ''}`)
      if (!DRY) {
        const { error } = await sb.from('predictor_matches').update(patch).eq('id', m.id)
        if (error) { console.error(`  FAIL: ${error.message}`); continue }
      }
      written++
    }
  }
  console.log(`\nPlaceholders: ${written} ${DRY ? 'would write' : 'written'}, ${already} already resolved, ${skipped} still awaiting upstream`)
  return { written, skipped, already }
}

// ------------- Opta kickoff+venue sync ---------------------------------

const optaKey = require(path.resolve(process.cwd(), '../keys/opta-api.json')) as {
  outletApiKey: string; secretKey1: string
}
const TMCL_WC2026 = '873cbl9cd9butm4air0mugxzo'

function getOptaToken(): Promise<string> {
  const ts = Date.now().toString()
  const hash = crypto.createHash('sha512').update(optaKey.outletApiKey + ts + optaKey.secretKey1).digest('hex')
  const postData = qs.stringify({ grant_type: 'client_credentials', scope: 'b2b-feeds-auth' })
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth.performgroup.com',
      path: '/oauth/token/' + optaKey.outletApiKey + '?_fmt=json&_rt=b',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length,
        'Timestamp': ts,
        'Authorization': 'Basic ' + hash,
      },
    }, res => {
      let data = ''; res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data).access_token) } catch (e) { reject(e) } })
    })
    req.on('error', reject); req.write(postData); req.end()
  })
}

function fetchOptaJson(pathUrl: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'api.performfeeds.com', path: pathUrl, headers: { Authorization: 'Bearer ' + token } }, res => {
      let data = ''; res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

// Opta long venue name → our display venue
const VENUE_MAP: Record<string, string> = {
  'New York New Jersey Stadium': 'MetLife Stadium, New York',
  'Dallas Stadium': 'AT&T Stadium, Arlington',
  'Atlanta Stadium': 'Mercedes-Benz Stadium, Atlanta',
  'Miami Stadium': 'Hard Rock Stadium, Miami',
  'Los Angeles Stadium': 'SoFi Stadium, Los Angeles',
  'Boston Stadium': 'Gillette Stadium, Boston',
  'Philadelphia Stadium': 'Lincoln Financial Field, Philadelphia',
  'Houston Stadium': 'NRG Stadium, Houston',
  'Kansas City Stadium': 'Arrowhead Stadium, Kansas City',
  'Seattle Stadium': 'Lumen Field, Seattle',
  'San Francisco Bay Area Stadium': "Levi's Stadium, Santa Clara",
  'Toronto Stadium': 'BMO Field, Toronto',
  'Mexico City Stadium': 'Estadio Azteca, Mexico City',
  'BC Place Vancouver': 'BC Place, Vancouver',
  'Estadio Monterrey': 'Estadio BBVA, Monterrey',
}

async function syncOptaKickoffAndVenue() {
  console.log('\n=== Opta kickoff + venue sync (knockout only) ===')
  const token = await getOptaToken()
  const url = `/soccerdata/match/${optaKey.outletApiKey}?tmcl=${TMCL_WC2026}&_pgSz=200&_rt=b&_fmt=json`
  const data = await fetchOptaJson(url, token)
  const optaMatches: any[] = data.match || []
  // Filter to knockout stages
  const knockouts = optaMatches.filter(m => {
    const stg = m.matchInfo?.stage?.name || ''
    return /Final|Semi|Quarter|8th Finals|16th Finals|Third|3rd/i.test(stg)
  })
  console.log(`Opta knockout fixtures: ${knockouts.length}`)

  // Load all DB knockout rows once
  const { data: dbAll } = await sb
    .from('predictor_matches')
    .select('id, match_num, round_code, home_team_code, away_team_code, kickoff_at, venue')
    .in('round_code', ['r32', 'r16', 'qf', 'sf', 'final'])
    .order('match_num')
  if (!dbAll) return

  let patched = 0
  for (const dbRow of dbAll) {
    // If either side is still a placeholder, we can't confidently match by teams. Match Final/3rd by round+order instead.
    const home = dbRow.home_team_code
    const away = dbRow.away_team_code
    const isPlaceholder = /^(Winner|Loser) M\d+$/.test(home) || /^(Winner|Loser) M\d+$/.test(away)

    // Try to find matching Opta fixture
    let match: any = null
    if (!isPlaceholder) {
      match = knockouts.find(m => {
        const c = m.matchInfo?.contestant || []
        const h = c.find((x: any) => x.position === 'home')?.name
        const a = c.find((x: any) => x.position === 'away')?.name
        return (h === home && a === away) || (h === away && a === home)
      })
    } else {
      // For placeholder rows (Final/3rd before SF is done), match by stage + date order
      const stage = dbRow.round_code === 'final'
        ? (dbRow.match_num === 103 ? /Third|3rd/i : /^Final$/i)
        : dbRow.round_code === 'sf' ? /Semi/i
        : dbRow.round_code === 'qf' ? /Quarter/i
        : dbRow.round_code === 'r16' ? /8th/i
        : /16th/i
      const candidates = knockouts.filter(m => stage.test(m.matchInfo?.stage?.name || ''))
        .sort((a, b) => (a.matchInfo?.date || '').localeCompare(b.matchInfo?.date || ''))
      // Match by index within the round. Requires DB match_num order to align with Opta chronological order for that round.
      const roundRows = dbAll.filter(r => r.round_code === dbRow.round_code).sort((a, b) => a.match_num - b.match_num)
      const idx = roundRows.findIndex(r => r.id === dbRow.id)
      match = candidates[idx]
    }
    if (!match) continue

    const optaTime = `${match.matchInfo?.date?.slice(0, 10)}T${match.matchInfo?.time?.slice(0, 8)}+00:00`.replace('ZT', 'T').replace('Z+', '+')
    const optaVenueRaw = match.matchInfo?.venue?.longName || match.matchInfo?.venue?.shortName || ''
    const optaVenueDisplay = VENUE_MAP[optaVenueRaw] || optaVenueRaw

    const patch: Record<string, string> = {}
    if (optaTime && optaTime !== dbRow.kickoff_at) patch.kickoff_at = optaTime
    if (optaVenueDisplay && optaVenueDisplay !== dbRow.venue) patch.venue = optaVenueDisplay
    if (Object.keys(patch).length === 0) continue

    console.log(`M${dbRow.match_num} [${dbRow.round_code}] drift: ${JSON.stringify(patch)}${DRY ? '  (DRY)' : ''}`)
    if (!DRY) {
      const { error } = await sb.from('predictor_matches').update(patch).eq('id', dbRow.id)
      if (error) { console.error(`  FAIL: ${error.message}`); continue }
    }
    patched++
  }
  console.log(`Opta sync: ${patched} rows ${DRY ? 'would patch' : 'patched'}`)
  return patched
}

;(async () => {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] resolve-knockout-placeholders (${DRY ? 'DRY' : 'APPLY'}${NO_OPTA ? ' NO-OPTA' : ''})`)
  await resolvePlaceholders()
  if (!NO_OPTA) {
    try { await syncOptaKickoffAndVenue() }
    catch (e: any) { console.error('Opta sync failed:', e.message) }
  }
  console.log(`done in ${((Date.now() - start) / 1000).toFixed(1)}s`)
})().catch(e => { console.error(e); process.exit(1) })
