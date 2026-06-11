/**
 * Pure helpers for resolving the `predictor_matches.goalscorers` jsonb
 * payload into a flat list of per-side goal rows for UI rendering.
 *
 * Production shape (as written by the Opta sync cron, see wc26-fixtures-sync):
 *   [{
 *     type: 'G' | 'O' | 'P',     // G = goal, O = own goal, P = penalty
 *     minute: number | null,
 *     period_id: number | null,
 *     scorer_id: string | null,
 *     scorer_name: string | null,
 *     contestant_id: string | null,
 *     home_score: number,         // score AFTER this goal
 *     away_score: number
 *   }]
 *
 * We don't have a reliable `team` / `side` field on each entry, so we
 * walk the array in chronological order and use the running tally vs the
 * recorded home/away score to detect which side scored.
 *
 * Future-proofing: if a `side` or `team` field appears, prefer that.
 */

export type GoalSide = 'home' | 'away'
export type GoalType = 'G' | 'O' | 'P' | 'OTHER'

export interface RawGoalscorer {
  type?: string | null
  minute?: number | null
  scorer_id?: string | null
  scorer_name?: string | null
  contestant_id?: string | null
  period_id?: number | null
  home_score?: number | null
  away_score?: number | null
  team?: string | null
  side?: 'home' | 'away' | null
}

export interface GoalRow {
  side: GoalSide
  minute: number | null
  label: string
  type: GoalType
}

export function resolveGoalSides(raw: unknown): GoalRow[] {
  if (!Array.isArray(raw)) return []
  const entries: RawGoalscorer[] = raw.filter(
    (g): g is RawGoalscorer => g !== null && typeof g === 'object'
  )
  // Stable sort by minute (nulls last). Array.prototype.sort is stable in
  // modern V8 so ties preserve original order.
  const sorted = [...entries].sort((a, b) => {
    const am = a.minute ?? Number.MAX_SAFE_INTEGER
    const bm = b.minute ?? Number.MAX_SAFE_INTEGER
    return am - bm
  })

  let runHome = 0
  let runAway = 0
  const out: GoalRow[] = []

  for (const g of sorted) {
    let side: GoalSide | null = null

    if (g.side === 'home' || g.side === 'away') {
      side = g.side
    } else if (g.team === 'home' || g.team === 'away') {
      side = g.team
    } else if (typeof g.home_score === 'number' && typeof g.away_score === 'number') {
      const homeUp = g.home_score > runHome
      const awayUp = g.away_score > runAway
      if (homeUp && !awayUp) side = 'home'
      else if (awayUp && !homeUp) side = 'away'
      else if (homeUp && awayUp) {
        if (g.home_score - runHome === 1 && g.away_score - runAway !== 1) side = 'home'
        else if (g.away_score - runAway === 1 && g.home_score - runHome !== 1) side = 'away'
        else side = 'home'
      }
      runHome = g.home_score
      runAway = g.away_score
    }

    if (!side) continue

    const rawType = (g.type ?? 'G').toString().toUpperCase()
    const goalType: GoalType =
      rawType === 'O' || rawType === 'OG' ? 'O'
      : rawType === 'P' || rawType === 'PEN' ? 'P'
      : rawType === 'G' ? 'G'
      : 'OTHER'

    const label =
      typeof g.scorer_name === 'string' && g.scorer_name.trim().length > 0
        ? g.scorer_name.trim()
        : 'Goal'

    out.push({
      side,
      minute: typeof g.minute === 'number' ? g.minute : null,
      label,
      type: goalType,
    })
  }
  return out
}
