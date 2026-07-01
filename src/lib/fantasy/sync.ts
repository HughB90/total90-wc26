/**
 * Fantasy sync library — shared between the cron route and the CLI script.
 *
 * Pipeline:
 *   1. Pull WC2026 fixtures from Opta MA1
 *   2. For each played fixture, pull MA2 (per-player stats)
 *   3. Send each player's stat map to the scoring controller
 *      (HughB90/total90-scoring-controller — vendored Josue v1.4)
 *   4. Upsert into Supabase: fantasy_fixtures, fantasy_player_match_stats
 *
 * Hard rule: ALL scoring math lives in the Python service. This module is
 * pure plumbing. Do not add point math here.
 */

import * as crypto from 'crypto'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type PosType = 'GKP' | 'DEF' | 'MID' | 'FOR'

/** What the Python scoring service accepts (`PlayerData` Pydantic model). */
interface ScoringPayload {
  playerId: string
  position: 'Forward' | 'Midfielder' | 'Defender' | 'Goalkeeper'
  compId: string
  teamId: string
  tournamentId: string
  // Plus any number of Opta stat fields (extra: allow).
  [stat: string]: string | number
}

/** Shape returned by `POST /calculate-score`. */
interface ScoringResponse {
  playerId: string
  position: string
  scores: Record<string, number>
  totalScore: number
}

export interface SyncOptions {
  /** If true, score and log but do not write to Supabase. */
  dryRun?: boolean
  /** Hard wall-clock budget (ms). Loop exits cleanly when remaining < 5s. */
  deadlineMs?: number
  /** Max concurrent scoring API calls. Default 5. */
  scoringConcurrency?: number
  /** Optional onLog hook (defaults to console.log). */
  onLog?: (line: string) => void
}

export interface SyncResult {
  ok: true
  fixtures: number
  fixtures_played: number
  players_scored: number
  players_failed: number
  /** Fixtures whose scoring was skipped because they're already fully scored
   *  in fantasy_player_match_stats. Pure cost-savings counter. */
  fixtures_skipped_already_scored: number
  ms: number
  hit_deadline: boolean
  failures: Array<{ opta_player_id: string; error: string }>
}

/**
 * Minimum player-stat rows a fully-scored final match must have for the
 * skip-already-scored guard to trip. 11 starters × 2 teams = 22; we use
 * 22 as the floor. This is intentionally generous — a fixture with fewer
 * than 22 stat rows is likely a partial/interrupted score from a deadline-
 * hit prior run, so we re-score it to backfill.
 */
const MIN_PLAYERS_FOR_FULLY_SCORED = 22

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

const WC2026_TMCL = '873cbl9cd9butm4air0mugxzo'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env: ${key}`)
  return v
}

/**
 * Resolve Opta credentials.
 * - In the cron route: from env (OPTA_OUTLET, OPTA_SECRET).
 * - In the CLI script: from `~/.openclaw/workspace/keys/opta-api.json` (dev convenience).
 */
function getOptaCreds(): { outlet: string; secret: string } {
  if (process.env.OPTA_OUTLET && process.env.OPTA_SECRET) {
    return { outlet: process.env.OPTA_OUTLET, secret: process.env.OPTA_SECRET }
  }
  // Fallback for CLI dev runs.
  const home = process.env.HOME
  if (home) {
    const keyPath = path.join(home, '.openclaw/workspace/keys/opta-api.json')
    if (fs.existsSync(keyPath)) {
      const j = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
      return { outlet: j.outletApiKey, secret: j.secretKey1 }
    }
  }
  throw new Error('Opta credentials not available (set OPTA_OUTLET + OPTA_SECRET)')
}

// ──────────────────────────────────────────────────────────────────────────────
// Opta OAuth (lifted from existing sync-fantasy-from-opta.ts)
// ──────────────────────────────────────────────────────────────────────────────

function getOptaToken(outlet: string, secret: string): Promise<string> {
  const ts = Date.now().toString()
  const hash = crypto.createHash('sha512').update(outlet + ts + secret).digest('hex')
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'b2b-feeds-auth' }).toString()

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'oauth.performgroup.com',
        path: `/oauth/token/${outlet}?_fmt=json&_rt=b`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${hash}`,
          Timestamp: ts,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (!json.access_token) return reject(new Error('No token: ' + data))
            resolve(json.access_token)
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function optaGet(token: string, urlPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.performfeeds.com',
        path: urlPath,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`))
          }
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Position derivation (LOCAL — only used to bucket players for the UI;
// the Python service maps to Forward/Midfielder/Defender/Goalkeeper itself)
// ──────────────────────────────────────────────────────────────────────────────

export function getPos(posRaw: string | undefined): PosType {
  if (!posRaw) return 'MID'
  const p = posRaw.toUpperCase()
  if (p === 'GOALKEEPER' || p === 'GKP' || p.includes('KEEPER')) return 'GKP'
  if (
    p === 'STRIKER' ||
    p === 'FORWARD' ||
    p === 'ATTACKING MIDFIELDER' ||
    p.includes('FORWARD') ||
    p.includes('STRIKER') ||
    p.includes('ATTACKING MID') ||
    p === 'FW' ||
    p === 'LW' ||
    p === 'RW' ||
    p === 'ST' ||
    p === 'CF' ||
    p === 'CAM'
  ) {
    return 'FOR'
  }
  if (
    p === 'DEFENDER' ||
    p === 'WING BACK' ||
    p === 'CB' ||
    p === 'LB' ||
    p === 'RB' ||
    p === 'WB' ||
    p === 'CENTER BACK' ||
    p === 'FULL BACK'
  ) {
    return 'DEF'
  }
  if (
    p === 'MIDFIELDER' ||
    p === 'DEFENSIVE MIDFIELDER' ||
    p.includes('MIDFIELDER') ||
    p === 'CM' ||
    p === 'DM' ||
    p === 'CDM'
  ) {
    return 'MID'
  }
  return 'MID'
}

/** Map our internal pos_type → the position string Josue's API expects. */
function posTypeToScoringPosition(pt: PosType): ScoringPayload['position'] {
  switch (pt) {
    case 'GKP':
      return 'Goalkeeper'
    case 'DEF':
      return 'Defender'
    case 'MID':
      return 'Midfielder'
    case 'FOR':
      return 'Forward'
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Round code derivation (unchanged from prior script)
// ──────────────────────────────────────────────────────────────────────────────

export function deriveRoundCode(
  stage: string | undefined,
  _matchNum: number | undefined,
  week?: number | string
): string {
  if (!stage) return 'WC2026-MD1'
  const s = stage.toLowerCase()
  const w = typeof week === 'string' ? parseInt(week, 10) : week
  if (s.includes('group')) {
    if (w === 1) return 'WC2026-MD1'
    if (w === 2) return 'WC2026-MD2'
    if (w === 3) return 'WC2026-MD3'
    return 'WC2026-MD1'
  }
  if (s.includes('3rd place') || s.includes('third place')) return 'WC2026-3RD'
  if (s.includes('quarter')) return 'WC2026-QF'
  if (s.includes('semi')) return 'WC2026-SF'
  if (s.includes('16th finals') || s.includes('round of 32')) return 'WC2026-R32'
  if (s.includes('8th finals') || s.includes('round of 16')) return 'WC2026-R16'
  if (s === 'final' || s.includes('final')) return 'WC2026-F'
  return 'WC2026-MD1'
}

const ROUND_LABELS: Record<string, string> = {
  'WC2026-MD1': 'Round 1: Group Stage',
  'WC2026-MD2': 'Round 2: Group Stage',
  'WC2026-MD3': 'Round 3: Group Stage',
  'WC2026-R32': 'Round 4: Round of 32',
  'WC2026-R16': 'Round 5: Round of 16',
  'WC2026-QF': 'Round 6: Quarter Finals',
  'WC2026-SF': 'Round 7: Semi Finals',
  'WC2026-3RD': 'Round 8: 3rd Place',
  'WC2026-F': 'Round 8: Final',
}

export function roundLabel(code: string, fallback: string): string {
  return ROUND_LABELS[code] || fallback
}

// ──────────────────────────────────────────────────────────────────────────────
// Scoring service client
// ──────────────────────────────────────────────────────────────────────────────

function buildStatMap(player: any): Record<string, number> {
  const m: Record<string, number> = {}
  for (const s of player.stat || []) {
    m[s.type] = parseFloat(s.value) || 0
  }
  return m
}

function buildScoringPayload(
  player: any,
  posType: PosType,
  compId: string,
  teamId: string,
  tournamentId: string
): ScoringPayload {
  const payload: ScoringPayload = {
    playerId: player.playerId,
    position: posTypeToScoringPosition(posType),
    compId,
    teamId,
    tournamentId,
  }
  // Flatten the stat array into top-level keys — Josue's API matches stat
  // keys against scoring-module names internally.
  for (const s of player.stat || []) {
    const k = s.type
    if (k && typeof k === 'string') {
      payload[k] = parseFloat(s.value) || 0
    }
  }
  return payload
}

async function callScoringService(payload: ScoringPayload): Promise<ScoringResponse> {
  const url = requireEnv('SCORING_API_URL').replace(/\/+$/, '')
  const token = requireEnv('SCORING_API_TOKEN')
  const res = await fetch(`${url}/calculate-score`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Scoring service ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as ScoringResponse
}

// ──────────────────────────────────────────────────────────────────────────────
// Hand-rolled concurrency limiter (avoid adding a dep)
// ──────────────────────────────────────────────────────────────────────────────

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry point — shared by CLI script + cron route
// ──────────────────────────────────────────────────────────────────────────────

export async function runFantasySync(opts: SyncOptions = {}): Promise<SyncResult> {
  const t0 = Date.now()
  const log = opts.onLog ?? ((s: string) => console.log(s))
  const deadlineMs = opts.deadlineMs ?? Infinity
  const concurrency = opts.scoringConcurrency ?? 5
  const dryRun = !!opts.dryRun
  const deadlineAt = t0 + deadlineMs
  const timeLeft = () => deadlineAt - Date.now()
  const nearDeadline = () => timeLeft() < 5000

  const supabase: SupabaseClient = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { outlet, secret } = getOptaCreds()
  log('🔐 Getting Opta token...')
  const token = await getOptaToken(outlet, secret)

  log('📥 Pulling MA1 fixtures (live=yes)...')
  const ma1 = await optaGet(
    token,
    `/soccerdata/match/${outlet}?tmcl=${WC2026_TMCL}&live=yes&_rt=b&_fmt=json&_pgSz=200`
  )
  const matches = ma1.match || []
  log(`   ${matches.length} fixtures total`)

  const played = matches.filter((m: any) => m.liveData?.matchDetails?.matchStatus === 'Played')
  log(`   ${played.length} played`)

  // Get WC2026 competition id
  const { data: comp } = await supabase
    .from('fantasy_competitions')
    .select('id, opta_tmcl')
    .eq('code', 'WC2026')
    .single()
  if (!comp) throw new Error('WC2026 competition not found in DB')
  const compId = comp.id as string
  const tournamentId = (comp.opta_tmcl as string) || WC2026_TMCL

  // ── 1. Stub fixture rows for ALL fixtures ───────────────────────────────
  const fixtureRows: any[] = []
  for (const m of matches) {
    const mi = m.matchInfo
    const roundCode = deriveRoundCode(mi.stage?.name, mi.matchNumber, mi.week)
    const status = m.liveData?.matchDetails?.matchStatus === 'Played' ? 'played' : 'scheduled'
    const home = mi.contestant?.find((c: any) => c.position === 'home')
    const away = mi.contestant?.find((c: any) => c.position === 'away')
    const scores = m.liveData?.matchDetails?.scores || {}
    fixtureRows.push({
      competition_id: compId,
      opta_fixture_id: mi.id,
      date: mi.date,
      round_code: roundCode,
      round_name: roundLabel(roundCode, mi.stage?.name || 'Group Stage'),
      stage: roundCode.includes('MD') ? 'Group' : 'Knockout',
      home_team: home?.name || 'Unknown',
      away_team: away?.name || 'Unknown',
      home_score: scores.total?.home ?? scores.ft?.home ?? null,
      away_score: scores.total?.away ?? scores.ft?.away ?? null,
      status,
    })
  }
  log(`   ${fixtureRows.length} fixture stubs queued (${played.length} played)`)

  // ── 2. Score every played fixture's players via the scoring service ─────
  type PlayerRow = {
    competition_id: string
    opta_player_id: string
    name: string
    first_name: string | null
    last_name: string | null
    team: string
    position: string | undefined
    pos_type: PosType
    mins: number
    fantasy_points: number
    breakdown: Record<string, number>
    raw_stats: Record<string, number>
    _opta_fixture_id: string
  }
  // ── Skip-already-scored prefetch ────────────────────────────────────────
  // Pull the current state of fantasy_fixtures + a count of existing
  // fantasy_player_match_stats rows per fixture, indexed by opta_fixture_id.
  // Used inside the played-fixtures loop to short-circuit Opta MA2 +
  // scoring service calls for fixtures that are already final and fully
  // scored. This is the primary fix for the "re-score every final match,
  // every cron tick, forever" wasted-invocation pattern.
  //
  // Cost: two cheap SELECTs (indexed) before the loop, in exchange for
  // skipping ~1.5k scoring calls per cycle once the tournament settles.
  const existingFixtureState = new Map<
    string,
    { id: string; status: string | null; scored_count: number }
  >()
  {
    const { data: existingFixtures, error: fxErr } = await supabase
      .from('fantasy_fixtures')
      .select('id, opta_fixture_id, status')
      .eq('competition_id', compId)
    if (fxErr) {
      log(`   ⚠️  fantasy_fixtures prefetch failed: ${fxErr.message}`)
    } else if (existingFixtures && existingFixtures.length > 0) {
      for (const f of existingFixtures) {
        existingFixtureState.set(f.opta_fixture_id as string, {
          id: f.id as string,
          status: (f.status as string | null) ?? null,
          scored_count: 0,
        })
      }
      const fixtureIds = existingFixtures.map((f) => f.id as string)
      // Bulk count player stat rows per fixture. PostgREST doesn't expose
      // GROUP BY directly, so pull (fixture_id) and tally client-side. This
      // is bounded by tournament size (~104 fixtures × ~30 players = ~3k
      // rows worst case), which is a single fast index scan.
      const { data: statRows, error: statErr } = await supabase
        .from('fantasy_player_match_stats')
        .select('fixture_id')
        .in('fixture_id', fixtureIds)
      if (statErr) {
        log(`   ⚠️  fantasy_player_match_stats prefetch failed: ${statErr.message}`)
      } else if (statRows) {
        const countByFixtureId = new Map<string, number>()
        for (const r of statRows) {
          const fid = r.fixture_id as string
          countByFixtureId.set(fid, (countByFixtureId.get(fid) ?? 0) + 1)
        }
        for (const state of existingFixtureState.values()) {
          state.scored_count = countByFixtureId.get(state.id) ?? 0
        }
      }
    }
    log(
      `   prefetched state for ${existingFixtureState.size} existing fixtures (skip-already-scored guard armed)`
    )
  }

  const playerRows: PlayerRow[] = []
  const failures: SyncResult['failures'] = []
  let hitDeadline = false
  let fixturesSkippedAlreadyScored = 0

  for (const m of played) {
    if (nearDeadline()) {
      hitDeadline = true
      log(`⏱️  Near deadline, stopping fixture loop`)
      break
    }
    const mi = m.matchInfo
    const fxId = mi.id

    // Skip-already-scored guard. A fixture is considered "done" when:
    //   1. Our local fantasy_fixtures row exists and is marked 'played'.
    //   2. The matching fantasy_player_match_stats row count is at or above
    //      MIN_PLAYERS_FOR_FULLY_SCORED.
    // Both conditions together rule out (a) brand-new fixtures we've never
    // touched, (b) prior runs that hit the deadline mid-scoring (would have
    // fewer rows than the floor), and (c) live matches mid-progress (since
    // Opta only reports matchStatus='Played' at full time, those don't
    // enter this loop in the first place).
    const existing = existingFixtureState.get(fxId)
    if (
      existing &&
      existing.status === 'played' &&
      existing.scored_count >= MIN_PLAYERS_FOR_FULLY_SCORED
    ) {
      fixturesSkippedAlreadyScored++
      log(
        `⏭️  Skipping fixture ${fxId} — already fully scored (${existing.scored_count} players)`
      )
      continue
    }
    log(
      `\n🔄 Scoring fixture ${fxId} (live or new; existing status=${existing?.status ?? 'none'}, players=${existing?.scored_count ?? 0})`
    )

    let ma2: any
    try {
      ma2 = await optaGet(
        token,
        `/soccerdata/matchstats/${outlet}?fx=${fxId}&detailed=yes&_rt=b&_fmt=json`
      )
    } catch (e: any) {
      log(`   ❌ MA2 fail: ${e.message}`)
      continue
    }

    const liveData = ma2.liveData || ma2
    const lineUps = liveData.lineUp || ma2.matchStats || []
    const home = mi.contestant?.find((c: any) => c.position === 'home')
    const away = mi.contestant?.find((c: any) => c.position === 'away')
    const scores = m.liveData?.matchDetails?.scores || {}
    const homeScore = scores.total?.home ?? scores.ft?.home ?? 0
    const awayScore = scores.total?.away ?? scores.ft?.away ?? 0
    const roundCode = deriveRoundCode(mi.stage?.name, mi.matchNumber, mi.week)

    // Overwrite stub with played payload
    const stubIdx = fixtureRows.findIndex((f) => f.opta_fixture_id === fxId)
    const playedRow = {
      competition_id: compId,
      opta_fixture_id: fxId,
      date: mi.date,
      round_code: roundCode,
      round_name: roundLabel(roundCode, mi.stage?.name || 'Group Stage'),
      stage: roundCode.includes('MD') ? 'Group' : 'Knockout',
      home_team: home?.name || 'Unknown',
      away_team: away?.name || 'Unknown',
      home_score: homeScore,
      away_score: awayScore,
      status: 'played',
    }
    if (stubIdx >= 0) fixtureRows[stubIdx] = playedRow
    else fixtureRows.push(playedRow)

    // Flatten players + score in parallel (concurrency-limited)
    type PendingPlayer = {
      lineUp: any
      player: any
      posType: PosType
      teamId: string
      teamName: string
      mins: number
    }
    const pending: PendingPlayer[] = []
    for (const lu of lineUps) {
      const isHome = lu.contestantId === home?.id
      const teamName = isHome ? home?.name : away?.name
      const teamId = lu.contestantId
      for (const p of lu.player || []) {
        const posType = getPos(p.position || p.matchPosition)
        const stats = buildStatMap(p)
        const mins = stats.minsPlayed || 0
        if (mins === 0) continue
        pending.push({ lineUp: lu, player: p, posType, teamId, teamName, mins })
      }
    }

    await mapLimit(pending, concurrency, async (item) => {
      const payload = buildScoringPayload(item.player, item.posType, compId, item.teamId, tournamentId)
      try {
        const resp = await callScoringService(payload)
        playerRows.push({
          competition_id: compId,
          opta_player_id: item.player.playerId,
          name:
            item.player.matchName ||
            item.player.shortName ||
            `${item.player.firstName || ''} ${item.player.lastName || ''}`.trim(),
          first_name: item.player.firstName || null,
          last_name: item.player.lastName || null,
          team: item.teamName,
          position: item.player.position || item.player.matchPosition,
          pos_type: item.posType,
          mins: item.mins,
          fantasy_points: Math.round(resp.totalScore * 100) / 100,
          breakdown: resp.scores,
          raw_stats: buildStatMap(item.player),
          _opta_fixture_id: fxId,
        })
      } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e)
        log(`   ⚠️  Score fail for ${item.player.playerId}: ${msg}`)
        failures.push({ opta_player_id: item.player.playerId, error: msg })
      }
    })

    // Mini rate-limit between fixtures (Opta side; scoring service is ours)
    await new Promise((r) => setTimeout(r, 250))
  }

  log(
    `\n📊 Summary: ${fixtureRows.length} fixtures, ${playerRows.length} player-match rows, ${failures.length} failures, ${fixturesSkippedAlreadyScored} fixtures skipped (already fully scored)`
  )

  if (dryRun) {
    log('🚧 DRY RUN — no DB write')
    const top = [...playerRows].sort((a, b) => b.fantasy_points - a.fantasy_points).slice(0, 10)
    log('Top 10 performers:')
    top.forEach((p, i) =>
      log(`  ${i + 1}. ${p.name} (${p.pos_type}, ${p.team}) — ${p.fantasy_points} pts`)
    )
    return {
      ok: true,
      fixtures: fixtureRows.length,
      fixtures_played: played.length,
      players_scored: playerRows.length,
      players_failed: failures.length,
      fixtures_skipped_already_scored: fixturesSkippedAlreadyScored,
      ms: Date.now() - t0,
      hit_deadline: hitDeadline,
      failures,
    }
  }

  // ── 3. Upsert ──────────────────────────────────────────────────────────
  log('💾 Writing to Supabase...')
  for (const fx of fixtureRows) {
    const { error } = await supabase.from('fantasy_fixtures').upsert(fx, {
      onConflict: 'competition_id,opta_fixture_id',
    })
    if (error) log(`   ❌ Fixture upsert error: ${error.message}`)
  }

  const { data: fixtures } = await supabase
    .from('fantasy_fixtures')
    .select('id, opta_fixture_id')
    .eq('competition_id', compId)
  const fixtureIdMap = new Map(fixtures?.map((f) => [f.opta_fixture_id, f.id]) || [])

  let upserted = 0
  let skipped = 0
  for (const pr of playerRows) {
    const fixture_id = fixtureIdMap.get(pr._opta_fixture_id)
    if (!fixture_id) {
      skipped++
      continue
    }
    const { _opta_fixture_id, ...rest } = pr
    void _opta_fixture_id
    const row = { ...rest, fixture_id }
    const { error } = await supabase
      .from('fantasy_player_match_stats')
      .upsert(row, { onConflict: 'fixture_id,opta_player_id' })
    if (error) log(`   ❌ Player upsert error: ${error.message}`)
    else upserted++
  }
  log(`   ✓ ${upserted} player-match rows upserted, ${skipped} skipped (no fixture_id)`)
  log('✅ Sync complete!')

  return {
    ok: true,
    fixtures: fixtureRows.length,
    fixtures_played: played.length,
    players_scored: upserted,
    players_failed: failures.length,
    fixtures_skipped_already_scored: fixturesSkippedAlreadyScored,
    ms: Date.now() - t0,
    hit_deadline: hitDeadline,
    failures,
  }
}
