/**
 * Knockout cascade — client-side projection from R32 user picks all the way
 * to the Final / 3rd-Place playoff.
 *
 * The `predictor_matches` table stores knockout pairings using placeholder
 * `home_team_code`/`away_team_code` strings like `"Winner M73"` and
 * `"Loser M101"`. Real team codes only appear once Opta finalizes results
 * and an admin updates the row. Until then we project the entrants from
 * the user's own picks so they can fill in the whole bracket pre-tournament.
 *
 * IMPORTANT: this projection is DISPLAY-ONLY. All persistence (`if_draw_winner`,
 * etc.) still uses the literal placeholder strings the server validates against.
 */

export interface CascadeMatch {
  id: string
  match_num: number
  round_code: string
  home_team_code: string
  away_team_code: string
  kickoff_at: string
  // Final result fields (null until admin marks final).
  home_score: number | null
  away_score: number | null
  went_to_pks: boolean | null
  pk_winner_team_code: string | null
  status: string | null
}

export interface CascadePick {
  match_id: string
  home_score: number
  away_score: number
  if_draw_winner: string | null
}

const PLACEHOLDER_RE = /^(Winner|Loser)\s+M(\d+)$/i

export function parsePlaceholder(code: string): { kind: 'winner' | 'loser'; matchNum: number } | null {
  const m = PLACEHOLDER_RE.exec(code)
  if (!m) return null
  return {
    kind: (m[1].toLowerCase() as 'winner' | 'loser'),
    matchNum: parseInt(m[2], 10),
  }
}

/** True when the team code is a real team (not a placeholder). */
export function isResolvedTeam(code: string): boolean {
  return parsePlaceholder(code) === null
}

/**
 * Resolve the actual winner/loser of a match from the DB result (Opta).
 * Returns null if the match isn't finalized yet.
 */
function resolveActual(m: CascadeMatch): { winner: string | null; loser: string | null } {
  if (m.home_score === null || m.away_score === null) return { winner: null, loser: null }
  // Knockout result: home_score > away_score → home wins.
  if (m.home_score > m.away_score) return { winner: m.home_team_code, loser: m.away_team_code }
  if (m.away_score > m.home_score) return { winner: m.away_team_code, loser: m.home_team_code }
  // Tied at 90 → PKs decide.
  if (m.went_to_pks && m.pk_winner_team_code) {
    const winner = m.pk_winner_team_code
    const loser = winner === m.home_team_code ? m.away_team_code : m.home_team_code
    return { winner, loser }
  }
  return { winner: null, loser: null }
}

/**
 * Resolve the projected winner/loser of a match from the user's pick.
 * Returns null when no pick or pick is incomplete.
 *
 * For knockout matches with a tied score, the user's `if_draw_winner` is
 * used. If the pick references a placeholder team code (e.g. user picked
 * "Winner M73" to beat "Winner M74"), we recursively resolve.
 */
function resolvePick(
  m: CascadeMatch,
  pick: CascadePick | undefined,
  resolvedNames: Map<number, { winner: string | null; loser: string | null }>,
): { winner: string | null; loser: string | null } {
  if (!pick) return { winner: null, loser: null }
  const h = Number(pick.home_score)
  const a = Number(pick.away_score)
  if (!Number.isFinite(h) || !Number.isFinite(a)) return { winner: null, loser: null }

  let winnerCode: string | null = null
  let loserCode: string | null = null
  if (h > a) { winnerCode = m.home_team_code; loserCode = m.away_team_code }
  else if (a > h) { winnerCode = m.away_team_code; loserCode = m.home_team_code }
  else {
    // Draw — needs if_draw_winner. Server enforces this.
    if (!pick.if_draw_winner) return { winner: null, loser: null }
    winnerCode = pick.if_draw_winner
    loserCode = winnerCode === m.home_team_code ? m.away_team_code : m.home_team_code
  }

  // If the codes are placeholders (e.g. "Winner M73"), look up the resolved
  // entrant from earlier rounds.
  const winner = resolveCode(winnerCode, resolvedNames)
  const loser = resolveCode(loserCode, resolvedNames)
  return { winner, loser }
}

function resolveCode(
  code: string,
  resolvedNames: Map<number, { winner: string | null; loser: string | null }>,
): string | null {
  const ph = parsePlaceholder(code)
  if (!ph) return code  // real team code, return as-is
  const upstream = resolvedNames.get(ph.matchNum)
  if (!upstream) return null
  return ph.kind === 'winner' ? upstream.winner : upstream.loser
}

/**
 * Build a map from match_num → { winner, loser } projected team codes
 * across ALL knockout rounds. Processed in match_num order so that earlier
 * rounds resolve first and later rounds can reference them.
 *
 * Source priority per match:
 *   1. Real result (status='final' + scores in predictor_matches)
 *   2. User's pick
 *   3. null (placeholder stays)
 */
export function buildCascade(
  matches: CascadeMatch[],
  picksByMatchId: Map<string, CascadePick>,
): Map<number, { winner: string | null; loser: string | null }> {
  const resolved = new Map<number, { winner: string | null; loser: string | null }>()
  // Sort by match_num so M73 resolves before M89, etc.
  const sorted = [...matches].sort((a, b) => a.match_num - b.match_num)
  for (const m of sorted) {
    const actual = resolveActual(m)
    if (actual.winner) {
      resolved.set(m.match_num, actual)
      continue
    }
    const fromPick = resolvePick(m, picksByMatchId.get(m.id), resolved)
    resolved.set(m.match_num, fromPick)
  }
  return resolved
}

/**
 * Given a match's raw placeholder team code (e.g. "Winner M73") and the
 * full cascade map, return the team name to display. Falls back to the
 * placeholder string if no projection is available yet.
 */
export function projectTeamName(
  code: string,
  cascade: Map<number, { winner: string | null; loser: string | null }>,
): string {
  const ph = parsePlaceholder(code)
  if (!ph) return code
  const upstream = cascade.get(ph.matchNum)
  if (!upstream) return code
  const projected = ph.kind === 'winner' ? upstream.winner : upstream.loser
  return projected ?? code
}

/**
 * Determine which match_nums in later rounds reference a given parent
 * match_num via their placeholder team codes. Used for downstream-clear:
 * when the user changes the projected winner of M73, any R16/QF/SF/Final
 * match whose home/away is "Winner M73" or "Loser M73" must have its pick
 * cleared (the old pick was made against a stale projection).
 */
export function findDownstreamMatchIds(
  parentMatchNum: number,
  matches: CascadeMatch[],
): string[] {
  const out: string[] = []
  for (const m of matches) {
    if (m.match_num <= parentMatchNum) continue
    const phHome = parsePlaceholder(m.home_team_code)
    const phAway = parsePlaceholder(m.away_team_code)
    if (
      (phHome && phHome.matchNum === parentMatchNum) ||
      (phAway && phAway.matchNum === parentMatchNum)
    ) {
      out.push(m.id)
    }
  }
  return out
}

/**
 * Recursively collect the full downstream subtree from a parent match_num.
 * E.g. changing M73 may clear M89 (R16), which may clear M97 (QF), which
 * may clear M101 (SF), which may clear M104 (Final).
 */
export function findDownstreamSubtree(
  parentMatchNum: number,
  matches: CascadeMatch[],
): Set<string> {
  const out = new Set<string>()
  const queue: number[] = [parentMatchNum]
  const byNum = new Map(matches.map((m) => [m.match_num, m] as const))
  const seen = new Set<number>([parentMatchNum])
  while (queue.length) {
    const cur = queue.shift()!
    for (const childId of findDownstreamMatchIds(cur, matches)) {
      out.add(childId)
      const childMatch = matches.find((m) => m.id === childId)
      if (childMatch && !seen.has(childMatch.match_num)) {
        seen.add(childMatch.match_num)
        queue.push(childMatch.match_num)
      }
    }
  }
  return out
}
