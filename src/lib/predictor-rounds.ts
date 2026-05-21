/**
 * Canonical Predictor round config.
 *
 * Source of truth for:
 *   - Round labels / phases
 *   - Number of games per round (group: 24 visible, pick 16; KO: all required)
 *   - First kickoff per round + lock time (1 minute before first kickoff)
 *   - Whether stars are allowed (R1–R4 only)
 *   - Whether Anytime Goalscorer is allowed (R5–R8 only)
 *
 * Spec amendments 2026-05-20:
 *   - Stars: rounds 1–4 only, max 4 total per profile
 *   - Anytime Goalscorer: rounds 5–8 only, 2 pts per correct scorer
 *   - Round locks: 1 minute before first kickoff per round
 *
 * All times stored as UTC ISO. CT lock times for reference (CDT = UTC-5):
 *   R1: Thu Jun 11 13:59 CT  = 2026-06-11T18:59:00.000Z
 *   R2: Thu Jun 18 10:59 CT  = 2026-06-18T15:59:00.000Z
 *   R3: Wed Jun 24 13:59 CT  = 2026-06-24T18:59:00.000Z
 *   R4: Sun Jun 28 13:59 CT  = 2026-06-28T18:59:00.000Z
 *   R5: Sat Jul 04 11:59 CT  = 2026-07-04T16:59:00.000Z
 *   R6: Thu Jul 09 14:59 CT  = 2026-07-09T19:59:00.000Z
 *   R7: Tue Jul 14 13:59 CT  = 2026-07-14T18:59:00.000Z
 *   R8: Sat Jul 18 15:59 CT  = 2026-07-18T20:59:00.000Z
 */

export type RoundCode =
  | 'group_r1' | 'group_r2' | 'group_r3'
  | 'r32' | 'r16' | 'qf' | 'sf' | 'final'

export interface RoundConfig {
  code: RoundCode
  label: string           // "Round 1 — Group Stage 1"
  shortLabel: string      // "R1"
  phase: 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'
  ordinal: number         // 1..8
  /** Total games visible (group: 24, KO: variable). */
  games: number
  /** Group rounds: required = 16, knockouts: required = games. */
  required: number
  /** First kickoff of the round (UTC ISO). */
  kickoff_iso: string
  /** Lock time = first kickoff − 1 minute (UTC ISO). */
  lock_iso: string
  stars_enabled: boolean
  scorer_enabled: boolean
}

export const PREDICTOR_ROUNDS: RoundConfig[] = [
  {
    code: 'group_r1', ordinal: 1, label: 'Round 1 — Group Stage 1', shortLabel: 'R1',
    phase: 'group', games: 24, required: 16,
    kickoff_iso: '2026-06-11T19:00:00.000Z',
    lock_iso:    '2026-06-11T18:59:00.000Z',
    stars_enabled: true,  scorer_enabled: false,
  },
  {
    code: 'group_r2', ordinal: 2, label: 'Round 2 — Group Stage 2', shortLabel: 'R2',
    phase: 'group', games: 24, required: 16,
    kickoff_iso: '2026-06-18T16:00:00.000Z',
    lock_iso:    '2026-06-18T15:59:00.000Z',
    stars_enabled: true,  scorer_enabled: false,
  },
  {
    code: 'group_r3', ordinal: 3, label: 'Round 3 — Group Stage 3', shortLabel: 'R3',
    phase: 'group', games: 24, required: 16,
    kickoff_iso: '2026-06-24T19:00:00.000Z',
    lock_iso:    '2026-06-24T18:59:00.000Z',
    stars_enabled: true,  scorer_enabled: false,
  },
  {
    code: 'r32', ordinal: 4, label: 'Round 4 — Round of 32', shortLabel: 'R32',
    phase: 'r32', games: 16, required: 16,
    kickoff_iso: '2026-06-28T19:00:00.000Z',
    lock_iso:    '2026-06-28T18:59:00.000Z',
    stars_enabled: true,  scorer_enabled: false,
  },
  {
    code: 'r16', ordinal: 5, label: 'Round 5 — Round of 16', shortLabel: 'R16',
    phase: 'r16', games: 8, required: 8,
    kickoff_iso: '2026-07-04T17:00:00.000Z',
    lock_iso:    '2026-07-04T16:59:00.000Z',
    stars_enabled: false, scorer_enabled: true,
  },
  {
    code: 'qf', ordinal: 6, label: 'Round 6 — Quarterfinals', shortLabel: 'QF',
    phase: 'qf', games: 4, required: 4,
    kickoff_iso: '2026-07-09T20:00:00.000Z',
    lock_iso:    '2026-07-09T19:59:00.000Z',
    stars_enabled: false, scorer_enabled: true,
  },
  {
    code: 'sf', ordinal: 7, label: 'Round 7 — Semifinals', shortLabel: 'SF',
    phase: 'sf', games: 2, required: 2,
    kickoff_iso: '2026-07-14T19:00:00.000Z',
    lock_iso:    '2026-07-14T18:59:00.000Z',
    stars_enabled: false, scorer_enabled: true,
  },
  {
    code: 'final', ordinal: 8, label: 'Round 8 — Final & 3rd Place', shortLabel: 'F',
    phase: 'final', games: 2, required: 2,
    kickoff_iso: '2026-07-18T21:00:00.000Z',
    lock_iso:    '2026-07-18T20:59:00.000Z',
    stars_enabled: false, scorer_enabled: true,
  },
]

const BY_CODE = new Map(PREDICTOR_ROUNDS.map((r) => [r.code, r]))

export function getRound(code: string): RoundConfig | null {
  return BY_CODE.get(code as RoundCode) ?? null
}

export function isRoundLocked(round: RoundConfig, now = new Date()): boolean {
  return now.getTime() >= new Date(round.lock_iso).getTime()
}

/** Round status for tab strip + dashboards. */
export type RoundStatus = 'open' | 'locked' | 'submitted' | 'in-progress' | 'done'

/**
 * Per-profile cap on stars across the tournament.
 * Stars only allowed in R1–R4. Max 4 total.
 */
export const TOURNAMENT_STAR_CAP = 4

/**
 * Pre-tournament winner pick locks at R1's first kickoff (lock_iso).
 * (Hugh wanted "1 minute before kickoff" → that's lock_iso for R1.)
 */
export const WINNER_PICK_LOCK_ISO = PREDICTOR_ROUNDS[0].lock_iso

export function isWinnerPickLocked(now = new Date()): boolean {
  return now.getTime() >= new Date(WINNER_PICK_LOCK_ISO).getTime()
}

/** Knockout phases (no group_r*). */
export const KNOCKOUT_ROUND_CODES: ReadonlySet<RoundCode> = new Set([
  'r32', 'r16', 'qf', 'sf', 'final',
])
export const GROUP_ROUND_CODES: ReadonlySet<RoundCode> = new Set([
  'group_r1', 'group_r2', 'group_r3',
])
