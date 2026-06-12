/**
 * Late-entry winner-pick penalty math (CANONICAL).
 *
 * Spec (Hugh, 2026-06-12):
 *   - Full +40 pts if you submit BEFORE R1 kickoff (Jun 11, 14:00 CT).
 *   - Every full calendar day after Jun 11 (America/Chicago) costs -5 pts.
 *   - Floor at 0 — picking the winner never costs you points.
 *   - days_late and bonus_cap are LOCKED at first save and never recomputed.
 *     Late-entry users get exactly one shot at picking; no edits afterwards.
 *
 * This file is a pure helper: no DB, no clock side effects.
 */

export const FULL_BONUS_PTS = 40
export const PENALTY_PER_DAY_PTS = 5

/**
 * Tournament start in America/Chicago — June 11, 2026 (R1 kickoff day).
 * "Days late" counts CALENDAR days past this date in CT, not 24h rolling.
 * Day 0 = picks made any time on or before June 11 (CT).
 * Day 1 = picks made June 12 (CT). And so on.
 */
export const TOURNAMENT_START_CT = '2026-06-11'

/**
 * Number of full calendar days (America/Chicago) between `submittedAt` and
 * TOURNAMENT_START_CT (Jun 11). Returns:
 *   - 0 if submittedAt is on or before Jun 11 CT
 *   - 1 if submittedAt falls on Jun 12 CT
 *   - 2 if Jun 13 CT, ...
 *
 * Implementation note: we DON'T use `submittedAt.toLocaleDateString` because
 * that pulls runtime timezone data and we want a deterministic CT-based
 * comparison. We compute the date-string in CT using a fixed offset table
 * for the WC window (CDT = UTC-5 for all of June-July 2026).
 */
export function computeDaysLate(submittedAt: Date): number {
  // The entire WC window (Jun 11 – Jul 19 2026) is in CDT (UTC-5). No DST
  // boundary inside the window, so we can use a single offset.
  const CT_OFFSET_HOURS = -5
  const submittedCt = new Date(submittedAt.getTime() + CT_OFFSET_HOURS * 60 * 60 * 1000)

  // Pull the CT calendar date (YYYY-MM-DD) via UTC components AFTER the offset shift.
  const submittedDateCt = `${submittedCt.getUTCFullYear()}-${String(submittedCt.getUTCMonth() + 1).padStart(2, '0')}-${String(submittedCt.getUTCDate()).padStart(2, '0')}`

  if (submittedDateCt <= TOURNAMENT_START_CT) return 0

  // Both dates are now plain YYYY-MM-DD strings in CT. Subtract via UTC midnight.
  const a = Date.parse(`${TOURNAMENT_START_CT}T00:00:00Z`)
  const b = Date.parse(`${submittedDateCt}T00:00:00Z`)
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)))
}

/**
 * Max points the user can earn from their winner pick, given how many days
 * late they submitted. Floored at 0.
 */
export function computeBonusCap(daysLate: number): number {
  const cap = FULL_BONUS_PTS - Math.max(0, daysLate) * PENALTY_PER_DAY_PTS
  return Math.max(0, cap)
}

/**
 * Penalty in points (the delta from FULL_BONUS_PTS). Useful for UI:
 *   "+40 − 10 (2 days late) = +30"
 */
export function computePenaltyPts(daysLate: number): number {
  return FULL_BONUS_PTS - computeBonusCap(daysLate)
}

/**
 * One-shot helper for save flows: pass a Date, get the locked-in trio.
 */
export function computeWinnerPenalty(submittedAt: Date) {
  const daysLate = computeDaysLate(submittedAt)
  const bonusCap = computeBonusCap(daysLate)
  const penaltyPts = computePenaltyPts(daysLate)
  return { daysLate, bonusCap, penaltyPts }
}
