/**
 * GET /api/predictor/round/[round_code]
 *
 * Returns:
 *   {
 *     round_code,
 *     round: RoundConfig,        // includes label/phase/games/lock_iso/stars_enabled/scorer_enabled
 *     matches: PredictorMatch[],
 *     my_picks: PredictorPick[], // empty array for anon
 *     lock_at: ISO,              // canonical: round.lock_iso
 *     locked: boolean,
 *     my_star_count: number,     // stars used in THIS round
 *     my_total_stars: number     // stars used across the whole tournament
 *   }
 *
 * Public for matches; my_picks empty for anon callers.
 */

import { NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import { getRound, isRoundLocked } from '@/lib/predictor-rounds'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ round_code: string }> }
) {
  const { round_code } = await ctx.params
  const round = getRound(round_code)
  if (!round) return NextResponse.json({ error: 'invalid_round_code' }, { status: 400 })

  const sb = predictorAdmin()

  const { data: matches, error: mErr } = await sb
    .from('predictor_matches')
    .select('id, match_num, round_code, group_code, home_team_code, away_team_code, kickoff_at, venue, home_score, away_score, status, is_knockout')
    .eq('round_code', round.code)
    .order('kickoff_at', { ascending: true })

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const lockAtISO = round.lock_iso
  const locked = isRoundLocked(round)

  // Anon: just return public data
  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({
      round_code: round.code,
      round,
      matches: matches ?? [],
      my_picks: [],
      lock_at: lockAtISO,
      locked,
      my_star_count: 0,
      my_total_stars: 0,
    })
  }

  const matchIds = (matches ?? []).map((m) => m.id)
  let myPicks: Array<Record<string, unknown>> = []
  if (matchIds.length) {
    // Try to fetch with goalscorer_id; fall back gracefully if the column
    // doesn't exist yet on this DB.
    const trySelect = async (cols: string) => sb
      .from('predictor_picks')
      .select(cols)
      .eq('profile_id', session.profile_id)
      .in('match_id', matchIds)

    let res = await trySelect('match_id, home_score, away_score, if_draw_winner, is_star, goalscorer_id, updated_at')
    if (res.error && /goalscorer_id|column .* does not exist/i.test(res.error.message)) {
      res = await trySelect('match_id, home_score, away_score, if_draw_winner, is_star, updated_at')
    }
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    myPicks = (res.data as unknown as Array<Record<string, unknown>>) ?? []
  }

  const myStarCount = myPicks.filter((p) => Boolean(p.is_star)).length

  // Tournament-wide star count (cheap query)
  const { count: myTotalStars } = await sb
    .from('predictor_picks')
    .select('match_id', { count: 'exact', head: true })
    .eq('profile_id', session.profile_id)
    .eq('is_star', true)

  return NextResponse.json({
    round_code: round.code,
    round,
    matches: matches ?? [],
    my_picks: myPicks,
    lock_at: lockAtISO,
    locked,
    my_star_count: myStarCount,
    my_total_stars: myTotalStars ?? 0,
  })
}
