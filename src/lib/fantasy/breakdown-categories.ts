/**
 * Shared fantasy breakdown taxonomy.
 *
 * Mirrors the BREAKDOWN_META / CATEGORY_LABEL tables in
 * src/app/fantasy/FantasyClient.tsx so that other surfaces (the social
 * graphic generator, future shareable views, etc.) can compute the same
 * per-category subtotals as the live /fantasy breakdown UI.
 *
 * If FantasyClient's taxonomy ever changes, update this file too.
 */

export type BreakdownCategory =
  | 'attacking'
  | 'defensive'
  | 'discipline'
  | 'passing'
  | 'possession'
  | 'playmaker'
  | 'goalkeepers'

export const CATEGORY_LABEL: Record<BreakdownCategory, string> = {
  attacking: 'Attacking',
  defensive: 'Defensive',
  discipline: 'Discipline',
  passing: 'Passing',
  possession: 'Possession',
  playmaker: 'Playmaker',
  goalkeepers: 'Goalkeeping',
}

// Maps every breakdown / raw_stats key to its category.
export const BREAKDOWN_CATEGORY: Record<string, BreakdownCategory> = {
  // Attacking
  minsPlayed: 'attacking',
  goals: 'attacking',
  attIboxGoal: 'attacking',
  attHdGoal: 'attacking',
  attPenGoal: 'attacking',
  attGoalLowLeft: 'attacking',
  attGoalLowRight: 'attacking',
  totalScoringAtt: 'attacking',
  ontargetAttAssist: 'attacking',
  offtargetAttAssist: 'attacking',
  postScoringAtt: 'attacking',
  attSvLowLeft: 'attacking',
  attSvLowRight: 'attacking',
  attSvHighLeft: 'attacking',
  attSvHighRight: 'attacking',
  touchesInOppBox: 'attacking',
  wasFouled: 'attacking',
  wonContest: 'attacking',
  penAreaEntries: 'attacking',

  // Playmaker
  goalAssist: 'playmaker',
  goalAssistSetplay: 'playmaker',
  secondGoalAssist: 'playmaker',
  assistBlockedShot: 'playmaker',
  assistHandballWon: 'playmaker',
  assistOwnGoal: 'playmaker',
  totalAttAssist: 'playmaker',
  bigChanceCreated: 'playmaker',
  accurateThroughBall: 'playmaker',
  accuratePullBack: 'playmaker',
  winningGoal: 'playmaker',

  // Passing
  accuratePass: 'passing',
  accurateLongBalls: 'passing',
  accurateCrossNocorner: 'passing',
  accurateChippedPass: 'passing',
  accurateFlickOn: 'passing',
  accurateLayoffs: 'passing',
  successfulFinalThirdPasses: 'passing',

  // Defensive
  cleanSheet: 'defensive',
  goalsConceded: 'defensive',
  totalTackle: 'defensive',
  lastManTackle: 'defensive',
  outfielderBlock: 'defensive',
  sixYardBlock: 'defensive',
  interceptionsInBox: 'defensive',
  offsideProvoked: 'defensive',
  aerialWon: 'defensive',
  duelWon: 'defensive',

  // Possession
  ballRecovery: 'possession',
  dispossessed: 'possession',
  possLostAll: 'possession',
  turnover: 'possession',
  duelLost: 'possession',

  // Discipline
  fouls: 'discipline',
  yellowCard: 'discipline',
  totalOffside: 'discipline',
  errorLeadToShot: 'discipline',
  errorLeadToGoal: 'discipline',

  // Goalkeeping
  saves: 'goalkeepers',
  divingSave: 'goalkeepers',
  savedObox: 'goalkeepers',
  punches: 'goalkeepers',
  goodHighClaim: 'goalkeepers',
  accurateKeeperThrows: 'goalkeepers',
  accurateKeeperSweeper: 'goalkeepers',
  accurateGoalKicks: 'goalkeepers',
}

/**
 * Given a breakdown JSON (key -> fantasy-point contribution) from a single
 * match, return the per-category subtotal map.
 */
export function categorySubtotals(
  breakdown: Record<string, unknown> | null | undefined,
): Record<BreakdownCategory, number> {
  const totals: Record<BreakdownCategory, number> = {
    attacking: 0,
    defensive: 0,
    discipline: 0,
    passing: 0,
    possession: 0,
    playmaker: 0,
    goalkeepers: 0,
  }
  if (!breakdown || typeof breakdown !== 'object') return totals
  for (const [k, v] of Object.entries(breakdown)) {
    if (typeof v !== 'number') continue
    const cat = BREAKDOWN_CATEGORY[k]
    if (!cat) continue
    totals[cat] += v
  }
  return totals
}
