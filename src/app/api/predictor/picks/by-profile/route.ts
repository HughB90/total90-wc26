/**
 * GET /api/predictor/picks/by-profile?profile_id=...&round_code=...
 *
 * Lets a signed-in user peek at another league member's picks for a single
 * round, with results and per-pick scores attached. Returns the same shape
 * the existing /api/predictor/round/[round_code] returns for `my_picks` +
 * `my_scores`, so the client can reuse <PickSummaryRow />.
 *
 * Privacy rules:
 *   1. Caller must be signed in (profile session cookie).
 *   2. Caller must share AT LEAST ONE wc26_predictor_league with the target
 *      profile. (Global peeking is NOT allowed — leaderboard-only data
 *      doesn't expose strategy.) Looking at YOUR OWN picks is always OK.
 *   3. The round must already be past its first kickoff (`lock_at <= now`).
 *      Pre-lock peeking would let people copy picks. Hard 403 otherwise.
 *
 * Returns:
 *   {
 *     round_code,
 *     profile_id,
 *     manager_name,
 *     locked: true,                // always true on success
 *     matches: PredictorMatch[],   // SAME shape as /round/[code]
 *     picks: PickRow[],            // target user's picks
 *     scores: { [match_id]: ScoreBreakdown }
 *   }
 *
 * Error codes:
 *   400 — missing/invalid query params
 *   401 — no profile session
 *   403 — not sharing a league with target, or round not locked yet
 *   500 — db error
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

const VALID_ROUNDS = new Set([
  'group_r1', 'group_r2', 'group_r3',
  'r32', 'r16', 'qf', 'sf', 'final',
])

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const profileId = url.searchParams.get('profile_id')
  const roundCode = url.searchParams.get('round_code')

  if (!profileId || !roundCode) {
    return NextResponse.json({ error: 'profile_id_and_round_code_required' }, { status: 400 })
  }
  if (!VALID_ROUNDS.has(roundCode)) {
    return NextResponse.json({ error: 'invalid_round_code' }, { status: 400 })
  }

  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const sb = predictorAdmin()

  // ----- Shared-league check (skipped when peeking at self) -----------------
  if (profileId !== session.profile_id) {
    const { data: myLeagues, error: lErr } = await sb
      .from('wc26_predictor_league_members')
      .select('league_id')
      .eq('profile_id', session.profile_id)
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
    const myLeagueIds = (myLeagues ?? []).map((r) => r.league_id as string)
    if (myLeagueIds.length === 0) {
      return NextResponse.json({ error: 'no_shared_league' }, { status: 403 })
    }
    const { data: shared, error: sErr } = await sb
      .from('wc26_predictor_league_members')
      .select('league_id')
      .eq('profile_id', profileId)
      .in('league_id', myLeagueIds)
      .limit(1)
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
    if (!shared || shared.length === 0) {
      return NextResponse.json({ error: 'no_shared_league' }, { status: 403 })
    }
  }

  // ----- Load matches + enforce round-lock ----------------------------------
  const { data: matches, error: mErr } = await sb
    .from('predictor_matches')
    .select('id, match_num, round_code, group_code, home_team_code, away_team_code, kickoff_at, venue, home_score, away_score, went_to_pks, pk_winner_team_code, goalscorers, status, is_knockout')
    .eq('round_code', roundCode)
    .order('kickoff_at', { ascending: true })
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const matchList = matches ?? []
  if (matchList.length === 0) {
    return NextResponse.json({ error: 'no_matches' }, { status: 404 })
  }

  const firstKickoff = matchList
    .map((m) => new Date(m.kickoff_at as string).getTime())
    .sort((a, b) => a - b)[0]
  const locked = Date.now() >= firstKickoff
  if (!locked) {
    return NextResponse.json(
      { error: 'round_not_locked', unlocks_at: new Date(firstKickoff).toISOString() },
      { status: 403 },
    )
  }

  // ----- Load target profile name -------------------------------------------
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id, manager_name, first_name')
    .eq('id', profileId)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })
  const managerName = (profile.manager_name as string | null) ?? (profile.first_name as string | null) ?? 'Manager'

  // ----- Load target's picks + hydrate goalscorer metadata ------------------
  const matchIds = matchList.map((m) => m.id as string)
  const { data: pickRows, error: piErr } = await sb
    .from('predictor_picks')
    .select('match_id, home_score, away_score, if_draw_winner, pk_advance_team_id, is_star, goalscorer_player_id, goalscorer_team_code, updated_at')
    .eq('profile_id', profileId)
    .in('match_id', matchIds)
  if (piErr) return NextResponse.json({ error: piErr.message }, { status: 500 })

  let picks: Array<Record<string, unknown>> = (pickRows ?? []) as Array<Record<string, unknown>>

  const playerIds = Array.from(new Set(
    picks
      .map((p) => p.goalscorer_player_id)
      .filter((v): v is string => typeof v === 'string' && v.length > 0),
  ))
  if (playerIds.length > 0) {
    const { data: players, error: plErr } = await sb
      .from('s3_players')
      .select('id, name, short_name, last_name, nationality')
      .in('id', playerIds)
    if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 })
    const byId = new Map((players ?? []).map((p) => [p.id, p]))
    picks = picks.map((p) => {
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

  // ----- Load target's scores -----------------------------------------------
  const { data: scoreRows, error: sErr } = await sb
    .from('predictor_scores')
    .select('match_id, exact_pts, result_pts, scorer_pts, star_multiplier, total_pts, outcome_color')
    .eq('profile_id', profileId)
    .in('match_id', matchIds)
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const scores: Record<string, {
    exact_pts: number
    result_pts: number
    scorer_pts: number
    star_multiplier: number
    total_pts: number
    outcome_color: 'teal' | 'green' | 'red' | 'gray'
  }> = {}
  for (const s of scoreRows ?? []) {
    scores[s.match_id as string] = {
      exact_pts: (s.exact_pts as number) ?? 0,
      result_pts: (s.result_pts as number) ?? 0,
      scorer_pts: (s.scorer_pts as number) ?? 0,
      star_multiplier: (s.star_multiplier as number) ?? 1,
      total_pts: (s.total_pts as number) ?? 0,
      outcome_color: ((s.outcome_color as string) ?? 'gray') as 'teal' | 'green' | 'red' | 'gray',
    }
  }

  return NextResponse.json({
    round_code: roundCode,
    profile_id: profileId,
    manager_name: managerName,
    locked: true,
    matches: matchList,
    picks,
    scores,
  })
}
