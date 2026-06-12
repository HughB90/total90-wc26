/**
 * GET /api/predictor/round/[round_code]
 *
 * Returns:
 *   {
 *     round_code,
 *     matches: PredictorMatch[],
 *     my_picks: PredictorPick[],         // empty array for anon
 *     lock_at: ISO,                       // first kickoff in the round
 *     locked: boolean,
 *     my_star_count: number               // stars already used in this round
 *   }
 *
 * Public for matches; my_picks empty for anon callers.
 */

import { NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

const VALID_ROUNDS = new Set([
  'group_r1', 'group_r2', 'group_r3',
  'r32', 'r16', 'qf', 'sf', 'final',
])

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ round_code: string }> }
) {
  const { round_code } = await ctx.params
  if (!VALID_ROUNDS.has(round_code)) {
    return NextResponse.json({ error: 'invalid_round_code' }, { status: 400 })
  }

  const sb = predictorAdmin()

  const { data: matches, error: mErr } = await sb
    .from('predictor_matches')
    .select('id, match_num, round_code, group_code, home_team_code, away_team_code, kickoff_at, venue, home_score, away_score, went_to_pks, pk_winner_team_code, goalscorers, status, is_knockout')
    .eq('round_code', round_code)
    .order('kickoff_at', { ascending: true })

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const lockAt = matches && matches.length
    ? matches.map((m) => new Date(m.kickoff_at).getTime()).sort((a, b) => a - b)[0]
    : null
  const lockAtISO = lockAt ? new Date(lockAt).toISOString() : null
  const locked = lockAt ? Date.now() >= lockAt : false

  // Anon: just return public data
  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({
      round_code,
      matches: matches ?? [],
      my_picks: [],
      lock_at: lockAtISO,
      locked,
      my_star_count: 0,
    })
  }

  const matchIds = (matches ?? []).map((m) => m.id)
  let myPicks: Array<Record<string, unknown>> = []
  if (matchIds.length) {
    const { data: picks, error: pErr } = await sb
      .from('predictor_picks')
      .select('match_id, home_score, away_score, if_draw_winner, pk_advance_team_id, is_star, goalscorer_player_id, goalscorer_team_code, updated_at')
      .eq('profile_id', session.profile_id)
      .in('match_id', matchIds)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    myPicks = (picks ?? []) as Array<Record<string, unknown>>

    // Hydrate goalscorer player metadata (short_name + name) so the UI chip
    // can render without a second round-trip per match.
    const playerIds = Array.from(new Set(
      myPicks
        .map((p) => p.goalscorer_player_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    ))
    if (playerIds.length > 0) {
      const { data: players, error: plErr } = await sb
        .from('s3_players')
        .select('id, name, short_name, last_name, nationality')
        .in('id', playerIds)
      if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 })
      const byId = new Map((players ?? []).map((p) => [p.id, p]))
      myPicks = myPicks.map((p) => {
        const pid = p.goalscorer_player_id as string | null
        const found = pid ? byId.get(pid) : null
        return {
          ...p,
          goalscorer_player: found
            ? {
                id: found.id,
                name: found.name,
                short_name: found.short_name,
                last_name: found.last_name,
                nationality: found.nationality,
              }
            : null,
        }
      })
    }
  }

  const myStarCount = (myPicks as Array<{ is_star: boolean }>).filter((p) => p.is_star).length

  // Per-pick scores from predictor_scores (computed by /api/predictor/score-match
  // after a match finalizes). Only populated for matches that have been scored.
  // Shape returned to client: { [match_id]: { exact_pts, result_pts, scorer_pts,
  // star_multiplier, total_pts, outcome_color } }
  let myScores: Record<string, {
    exact_pts: number
    result_pts: number
    scorer_pts: number
    star_multiplier: number
    total_pts: number
    outcome_color: 'teal' | 'green' | 'red' | 'gray'
  }> = {}
  if (matchIds.length) {
    const { data: scoreRows, error: sErr } = await sb
      .from('predictor_scores')
      .select('match_id, exact_pts, result_pts, scorer_pts, star_multiplier, total_pts, outcome_color')
      .eq('profile_id', session.profile_id)
      .in('match_id', matchIds)
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
    for (const s of scoreRows ?? []) {
      myScores[s.match_id as string] = {
        exact_pts: (s.exact_pts as number) ?? 0,
        result_pts: (s.result_pts as number) ?? 0,
        scorer_pts: (s.scorer_pts as number) ?? 0,
        star_multiplier: (s.star_multiplier as number) ?? 1,
        total_pts: (s.total_pts as number) ?? 0,
        outcome_color: ((s.outcome_color as string) ?? 'gray') as 'teal' | 'green' | 'red' | 'gray',
      }
    }
  }

  return NextResponse.json({
    round_code,
    matches: matches ?? [],
    my_picks: myPicks,
    my_scores: myScores,
    lock_at: lockAtISO,
    locked,
    my_star_count: myStarCount,
  })
}
