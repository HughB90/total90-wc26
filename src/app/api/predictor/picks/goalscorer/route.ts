/**
 * POST /api/predictor/picks/goalscorer
 *
 * Body: { match_id: string, team_code: string, player_id: uuid }
 *
 * Upserts the goalscorer fields (`goalscorer_player_id`, `goalscorer_team_code`)
 * onto the existing `predictor_picks` row for (profile_id, match_id). If no
 * row exists yet (user hasn't picked a scoreline), inserts a minimal row
 * with home/away score 0 / 0 — the scoreline picker can overwrite this
 * later (the upsert in /api/predictor/picks merges by the same conflict key).
 *
 * Validations:
 *   - Session required
 *   - Match must exist and be in r16/qf/sf/final
 *   - team_code must equal home_team_code OR away_team_code of the match
 *   - player_id must exist in s3_players with matching nationality
 *   - Per-match kickoff lock: the specific match's kickoff_at must be in
 *     the future. Locks are evaluated per-match, NOT per-round, so the
 *     user can still edit unlocked matches in a round where the first
 *     game has already kicked off.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

const GOALSCORER_ROUNDS = new Set(['r16', 'qf', 'sf', 'final'])

function badRequest(message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { match_id?: unknown; team_code?: unknown; player_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest('invalid_json')
  }

  const matchId = typeof body.match_id === 'string' ? body.match_id : ''
  const teamCode = typeof body.team_code === 'string' ? body.team_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  if (!matchId) return badRequest('match_id_required')
  if (!teamCode) return badRequest('team_code_required')
  if (!playerId) return badRequest('player_id_required')

  const sb = predictorAdmin()

  // Validate the match exists and is a goalscorer-eligible round.
  const { data: match, error: matchErr } = await sb
    .from('predictor_matches')
    .select('id, round_code, home_team_code, away_team_code, kickoff_at')
    .eq('id', matchId)
    .maybeSingle()
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })
  if (!match) return badRequest('match_not_found', { match_id: matchId })
  if (!GOALSCORER_ROUNDS.has(match.round_code)) {
    return badRequest('goalscorer_not_allowed_in_round', { round_code: match.round_code })
  }
  if (teamCode !== match.home_team_code && teamCode !== match.away_team_code) {
    return badRequest('team_code_not_in_match', {
      got: teamCode,
      expected_one_of: [match.home_team_code, match.away_team_code],
    })
  }

  // Per-match lock: this specific match's kickoff_at must be in the future.
  const matchKickoffMs = new Date(match.kickoff_at).getTime()
  if (!Number.isFinite(matchKickoffMs) || Date.now() >= matchKickoffMs) {
    return NextResponse.json(
      {
        error: 'match_locked',
        match_id: match.id,
        kickoff_at: match.kickoff_at,
      },
      { status: 403 }
    )
  }

  // Validate player + nationality match
  const { data: player, error: playerErr } = await sb
    .from('s3_players')
    .select('id, nationality, short_name, name')
    .eq('id', playerId)
    .maybeSingle()
  if (playerErr) return NextResponse.json({ error: playerErr.message }, { status: 500 })
  if (!player) return badRequest('player_not_found', { player_id: playerId })
  if (player.nationality !== teamCode) {
    return badRequest('player_nationality_mismatch', {
      player_nationality: player.nationality,
      team_code: teamCode,
    })
  }

  // Update-only. The goalscorer route MUST NOT create a placeholder row
  // with home_score=0, away_score=0 — that misled users into thinking they
  // had submitted a scoreline pick when they hadn't. If the user hasn't
  // saved a scoreline yet for this match, return 409 so the UI can prompt
  // them to pick a winner first.
  const { data: updated, error: updErr } = await sb
    .from('predictor_picks')
    .update({
      goalscorer_player_id: playerId,
      goalscorer_team_code: teamCode,
    })
    .eq('profile_id', session.profile_id)
    .eq('match_id', matchId)
    .select('match_id, goalscorer_player_id, goalscorer_team_code, updated_at')

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      {
        error: 'scoreline_required',
        detail: 'Submit a score prediction for this match before saving a goalscorer.',
        match_id: matchId,
      },
      { status: 409 }
    )
  }

  return NextResponse.json({
    match_id: matchId,
    goalscorer_player_id: playerId,
    goalscorer_team_code: teamCode,
    created: false,
  })
}
