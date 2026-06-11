/**
 * Pure helpers for the WC26 Opta → predictor_matches sync.
 *
 * No I/O. Tested in isolation by the Node built-in test runner. The cron
 * route (`/api/cron/sync-wc26-fixtures`) owns the side effects (Opta HTTP,
 * Supabase upserts) and calls these helpers.
 */

// ---------------------------------------------------------------------------
// Team name → predictor_matches.{home,away}_team_code mapping
//
// `predictor_matches.home_team_code` is FIFA-style (e.g. "Mexico",
// "South Africa", "United States") matching the bracket UI. Opta's MA1
// payload uses `contestant.name` and `contestant.code` (3-letter, e.g.
// "MEX", "RSA"). We map by both, preferring the 3-letter code when
// present.
// ---------------------------------------------------------------------------

// Opta 3-letter → our team_code (display name used in predictor_matches)
export const OPTA_TEAM_CODE_TO_NAME: Record<string, string> = {
  MEX: 'Mexico',
  RSA: 'South Africa',
  KOR: 'South Korea',
  CZE: 'Czechia',
  CAN: 'Canada',
  BIH: 'Bosnia & Herzegovina',
  USA: 'USA',
  PAR: 'Paraguay',
  QAT: 'Qatar',
  SUI: 'Switzerland',
  BRA: 'Brazil',
  MAR: 'Morocco',
  HAI: 'Haiti',
  SCO: 'Scotland',
  AUS: 'Australia',
  TUR: 'Turkey',
  GER: 'Germany',
  CUW: 'Curaçao',
  NED: 'Netherlands',
  JPN: 'Japan',
  CIV: 'Ivory Coast',
  ECU: 'Ecuador',
  SWE: 'Sweden',
  TUN: 'Tunisia',
  ESP: 'Spain',
  CPV: 'Cape Verde',
  BEL: 'Belgium',
  EGY: 'Egypt',
  KSA: 'Saudi Arabia',
  URU: 'Uruguay',
  IRN: 'Iran',
  NZL: 'New Zealand',
  FRA: 'France',
  SEN: 'Senegal',
  IRQ: 'Iraq',
  NOR: 'Norway',
  ARG: 'Argentina',
  ALG: 'Algeria',
  AUT: 'Austria',
  JOR: 'Jordan',
  POR: 'Portugal',
  COD: 'DR Congo',
  ENG: 'England',
  CRO: 'Croatia',
  GHA: 'Ghana',
  PAN: 'Panama',
  UZB: 'Uzbekistan',
  COL: 'Colombia',
}

// Opta full name → team_code, used when contestant code is missing or unknown.
export const OPTA_TEAM_NAME_TO_NAME: Record<string, string> = {
  Mexico: 'Mexico',
  'South Africa': 'South Africa',
  'Korea Republic': 'South Korea',
  'South Korea': 'South Korea',
  'Czech Republic': 'Czechia',
  Czechia: 'Czechia',
  Canada: 'Canada',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Bosnia & Herzegovina': 'Bosnia & Herzegovina',
  'United States': 'USA',
  USA: 'USA',
  Paraguay: 'Paraguay',
  Qatar: 'Qatar',
  Switzerland: 'Switzerland',
  Brazil: 'Brazil',
  Morocco: 'Morocco',
  Haiti: 'Haiti',
  Scotland: 'Scotland',
  Australia: 'Australia',
  Turkey: 'Turkey',
  Türkiye: 'Turkey',
  Germany: 'Germany',
  Curaçao: 'Curaçao',
  Curacao: 'Curaçao',
  Netherlands: 'Netherlands',
  Japan: 'Japan',
  'Ivory Coast': 'Ivory Coast',
  "Côte d'Ivoire": 'Ivory Coast',
  Ecuador: 'Ecuador',
  Sweden: 'Sweden',
  Tunisia: 'Tunisia',
  Spain: 'Spain',
  'Cape Verde': 'Cape Verde',
  'Cabo Verde': 'Cape Verde',
  Belgium: 'Belgium',
  Egypt: 'Egypt',
  'Saudi Arabia': 'Saudi Arabia',
  Uruguay: 'Uruguay',
  Iran: 'Iran',
  'IR Iran': 'Iran',
  'New Zealand': 'New Zealand',
  France: 'France',
  Senegal: 'Senegal',
  Iraq: 'Iraq',
  Norway: 'Norway',
  Argentina: 'Argentina',
  Algeria: 'Algeria',
  Austria: 'Austria',
  Jordan: 'Jordan',
  Portugal: 'Portugal',
  'DR Congo': 'DR Congo',
  'Congo DR': 'DR Congo',
  England: 'England',
  Croatia: 'Croatia',
  Ghana: 'Ghana',
  Panama: 'Panama',
  Uzbekistan: 'Uzbekistan',
  Colombia: 'Colombia',
}

export function optaContestantToTeamCode(c: {
  code?: string | null
  name?: string | null
}): string | null {
  if (c.code && OPTA_TEAM_CODE_TO_NAME[c.code]) return OPTA_TEAM_CODE_TO_NAME[c.code]
  if (c.name && OPTA_TEAM_NAME_TO_NAME[c.name]) return OPTA_TEAM_NAME_TO_NAME[c.name]
  return null
}

// ---------------------------------------------------------------------------
// Opta match status / period normalisation
// ---------------------------------------------------------------------------

// Opta MA1 `matchStatus`/`live` values we expect:
//   "Fixture" / "scheduled" / "PreMatch"   → scheduled
//   "Playing" / "InProgress" / "Live"      → live
//   "Played" / "FullTime" / "Final"        → final
//   "Cancelled" / "Abandoned" / "Postponed"→ cancelled (we map Postponed too)
export function normaliseStatus(raw: string | null | undefined): {
  status: 'scheduled' | 'live' | 'final' | 'cancelled'
  period: string | null
} {
  if (!raw) return { status: 'scheduled', period: null }
  const s = String(raw).toLowerCase()
  if (s.includes('cancel') || s.includes('abandon')) {
    return { status: 'cancelled', period: 'CANCELLED' }
  }
  if (s.includes('postpon')) return { status: 'cancelled', period: 'POSTPONED' }
  if (s.includes('played') || s.includes('fulltime') || s === 'final') {
    return { status: 'final', period: 'FT' }
  }
  if (s.includes('half')) return { status: 'live', period: 'HT' }
  if (s.includes('first')) return { status: 'live', period: '1H' }
  if (s.includes('second')) return { status: 'live', period: '2H' }
  if (s.includes('extra')) return { status: 'live', period: 'ET' }
  if (s.includes('shoot') || s.includes('penalt')) return { status: 'live', period: 'PEN' }
  if (s.includes('playing') || s.includes('progress') || s === 'live') {
    return { status: 'live', period: '1H' }
  }
  return { status: 'scheduled', period: null }
}

// ---------------------------------------------------------------------------
// Opta → predictor_matches update payload
// ---------------------------------------------------------------------------

export interface OptaMatch {
  matchInfo?: {
    id?: string
    date?: string
    time?: string
    contestant?: Array<{
      code?: string
      name?: string
      position?: 'home' | 'away'
    }>
    stage?: { name?: string; longName?: string }
    week?: string | number
  }
  liveData?: {
    matchDetails?: {
      matchStatus?: string
      periodId?: number
      period?: string | unknown[]
      matchTime?: number
      matchLengthMin?: number
      matchLengthSec?: number
      scores?: {
        total?: { home?: number; away?: number }
        ht?: { home?: number; away?: number }
        ft?: { home?: number; away?: number }
        et?: { home?: number; away?: number }
        pen?: { home?: number; away?: number }
      }
    }
    goal?: Array<{
      contestantId?: string
      periodId?: number
      timeMin?: number
      timeMinSec?: number
      scorerId?: string
      scorerName?: string
      assistPlayerId?: string
      type?: string // "G" (goal), "O" (own goal), "P" (penalty)
      homeScore?: number
      awayScore?: number
    }>
  }
  // legacy / alternate shapes:
  id?: string
  status?: string
}

export interface PredictorMatchRow {
  id: string
  match_num: number
  round_code: string
  home_team_code: string
  away_team_code: string
  kickoff_at: string
  opta_fixture_id: string | null
}

export interface SyncUpdate {
  // row.id this update is targeted at
  predictor_match_id: string
  // payload — exactly the shape we'll `update(...)` on predictor_matches
  patch: {
    opta_fixture_id?: string
    home_score?: number | null
    away_score?: number | null
    status?: 'scheduled' | 'live' | 'final' | 'cancelled'
    period?: string | null
    minute?: number | null
    goalscorers?: unknown[]
    went_to_pks?: boolean
    pk_winner_team_code?: string | null
    last_synced_at: string
  }
}

/**
 * Try to match an Opta fixture to one of our predictor_matches rows.
 *
 * Strategy:
 *   1. If predictor row already has matching opta_fixture_id → direct hit.
 *   2. Else: match by (home_team_code, away_team_code, kickoff_at ±2h).
 *      Group matches use day-of-tournament; KO matches use exact kickoff.
 *      We accept ±2 hours of slack to absorb schedule changes.
 *
 * Returns the matched predictor row's id, or null.
 */
export function matchOptaFixtureToPredictor(
  optaMatch: OptaMatch,
  predictorRows: PredictorMatchRow[],
  toleranceMs: number = 2 * 60 * 60 * 1000
): string | null {
  const mi = optaMatch.matchInfo
  const optaId = mi?.id ?? optaMatch.id
  if (optaId) {
    const direct = predictorRows.find((r) => r.opta_fixture_id === optaId)
    if (direct) return direct.id
  }

  if (!mi || !mi.contestant || mi.contestant.length < 2) return null

  const home = mi.contestant.find((c) => c.position === 'home')
  const away = mi.contestant.find((c) => c.position === 'away')
  if (!home || !away) return null

  const homeCode = optaContestantToTeamCode(home)
  const awayCode = optaContestantToTeamCode(away)
  if (!homeCode || !awayCode) return null

  // Build kickoff timestamp. Opta gives `date` (YYYY-MM-DDZ) + `time` (HH:MM:SSZ).
  let optaKickoffMs: number | null = null
  if (mi.date) {
    const dateStr = mi.date.replace(/Z$/, '')
    const timeStr = (mi.time ?? '00:00:00Z').replace(/Z$/, '')
    const iso = `${dateStr}T${timeStr}Z`
    const t = new Date(iso).getTime()
    if (!Number.isNaN(t)) optaKickoffMs = t
  }

  // Find candidate rows with matching teams.
  const candidates = predictorRows.filter(
    (r) => r.home_team_code === homeCode && r.away_team_code === awayCode
  )
  if (candidates.length === 0) {
    // Try swapped (in case home/away are flipped in the schedule we have).
    const swapped = predictorRows.filter(
      (r) => r.home_team_code === awayCode && r.away_team_code === homeCode
    )
    if (swapped.length === 1) return swapped[0].id
    return null
  }
  if (candidates.length === 1) return candidates[0].id

  // Multiple candidates (rare: same fixture in group + KO theoretically; or
  // a placeholder collision). Use kickoff_at proximity to pick the best.
  if (optaKickoffMs == null) return candidates[0].id
  let best = candidates[0]
  let bestDelta = Math.abs(new Date(best.kickoff_at).getTime() - optaKickoffMs)
  for (const c of candidates.slice(1)) {
    const delta = Math.abs(new Date(c.kickoff_at).getTime() - optaKickoffMs)
    if (delta < bestDelta) {
      best = c
      bestDelta = delta
    }
  }
  if (bestDelta > toleranceMs) return null
  return best.id
}

/**
 * Build a SyncUpdate from an Opta match payload + the matched predictor row.
 *
 * Pure: no I/O. The cron passes `nowIso` from `new Date().toISOString()`
 * so tests can stub.
 */
export function buildSyncUpdate(
  optaMatch: OptaMatch,
  predictorRow: PredictorMatchRow,
  nowIso: string
): SyncUpdate {
  const mi = optaMatch.matchInfo ?? {}
  const ld = optaMatch.liveData ?? {}
  const md = ld.matchDetails ?? {}
  const optaId = mi.id ?? optaMatch.id ?? null

  const rawStatus =
    md.matchStatus ?? (typeof md.period === 'string' ? md.period : undefined) ?? optaMatch.status ?? null
  let { status, period } = normaliseStatus(rawStatus)

  // Refine period from periodId (Opta semantics):
  //   1 = 1H, 2 = 2H, 3 = ET1, 4 = ET2, 5 = Pens, 10 = HT, 14 = full-time, 16 = pre-match
  if (status === 'live') {
    switch (md.periodId) {
      case 1: period = '1H'; break
      case 2: period = '2H'; break
      case 3:
      case 4: period = 'ET'; break
      case 5: period = 'PEN'; break
      case 10: period = 'HT'; break
      default: break
    }
  }
  if (md.periodId === 14) { status = 'final'; period = 'FT' }

  // Scores: prefer total → ft → ht → 0/0 if live with no scores yet
  const totalScores =
    md.scores?.total ??
    md.scores?.ft ??
    (status === 'live' ? md.scores?.ht ?? { home: 0, away: 0 } : undefined)

  const home_score = totalScores?.home ?? null
  const away_score = totalScores?.away ?? null

  // Minute (Opta MA1 uses `matchTime`; older feeds use `matchLengthMin`)
  let minute: number | null = null
  if (typeof md.matchTime === 'number') minute = md.matchTime
  else if (typeof md.matchLengthMin === 'number') minute = md.matchLengthMin
  else if (status === 'live') minute = 0

  // PKs
  let went_to_pks = false
  let pk_winner_team_code: string | null = null
  if (md.scores?.pen && (md.scores.pen.home != null || md.scores.pen.away != null)) {
    went_to_pks = true
    if ((md.scores.pen.home ?? 0) > (md.scores.pen.away ?? 0)) {
      const home = mi.contestant?.find((c) => c.position === 'home')
      pk_winner_team_code = home ? optaContestantToTeamCode(home) : null
    } else if ((md.scores.pen.away ?? 0) > (md.scores.pen.home ?? 0)) {
      const away = mi.contestant?.find((c) => c.position === 'away')
      pk_winner_team_code = away ? optaContestantToTeamCode(away) : null
    }
  }

  // Goalscorers
  let goalscorers: unknown[] | undefined
  if (Array.isArray(ld.goal)) {
    goalscorers = ld.goal.map((g) => ({
      scorer_id: g.scorerId ?? null,
      scorer_name: g.scorerName ?? null,
      contestant_id: g.contestantId ?? null,
      minute: g.timeMin ?? null,
      period_id: g.periodId ?? null,
      type: g.type ?? 'G',
      home_score: g.homeScore ?? null,
      away_score: g.awayScore ?? null,
    }))
  }

  const patch: SyncUpdate['patch'] = {
    last_synced_at: nowIso,
  }

  if (optaId) patch.opta_fixture_id = optaId
  if (status) patch.status = status
  if (period !== null) patch.period = period
  if (minute !== null) patch.minute = minute
  if (home_score !== null) patch.home_score = home_score
  if (away_score !== null) patch.away_score = away_score
  if (went_to_pks) {
    patch.went_to_pks = true
    if (pk_winner_team_code) patch.pk_winner_team_code = pk_winner_team_code
  }
  if (goalscorers && goalscorers.length > 0) patch.goalscorers = goalscorers

  return {
    predictor_match_id: predictorRow.id,
    patch,
  }
}

// ---------------------------------------------------------------------------
// Cron decision: should we even hit Opta right now?
// ---------------------------------------------------------------------------

/**
 * Live window check. WC26 kickoffs span ~10:00–04:00 UTC (covering all
 * North American time zones). Outside that window we still sync but less
 * often (the cron schedule itself handles cadence — this helper exists for
 * future use / testing of the boundary logic).
 */
export function isInLiveWindow(now: Date): boolean {
  const h = now.getUTCHours()
  return h >= 10 || h < 4
}

/**
 * Decide whether a row needs a sync at all. We always sync `live` rows.
 * `scheduled` rows are synced if kickoff is within ±15 minutes of now (to
 * catch the live transition) OR if they've never been synced.
 * `final` rows are skipped (they're done — manual re-edit is the override).
 */
export function shouldSyncRow(
  row: {
    status: string
    kickoff_at: string
    last_synced_at: string | null
  },
  nowMs: number = Date.now()
): boolean {
  if (row.status === 'cancelled') return false
  if (row.status === 'final') return false
  if (row.status === 'live') return true
  // scheduled
  const ko = new Date(row.kickoff_at).getTime()
  if (Number.isNaN(ko)) return false
  const deltaMin = (ko - nowMs) / 60000
  // From 15 min before kickoff through any time after, until status flips.
  if (deltaMin <= 15) return true
  // Never-synced rows: do an initial probe (rare; only on cron's first run).
  if (!row.last_synced_at) return false
  return false
}
