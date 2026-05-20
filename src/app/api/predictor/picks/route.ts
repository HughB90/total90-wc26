/**
 * POST /api/predictor/picks
 *
 * Submit/update a batch of picks for a single round.
 *
 * Body: {
 *   round_code: 'group_r1' | 'group_r2' | 'group_r3' | 'r32' | 'r16' | 'qf' | 'sf' | 'final',
 *   picks: [{ match_id, home_score, away_score, if_draw_winner?, is_star }]
 * }
 *
 * Validation:
 *   - Session required
 *   - Every match_id must belong to round_code
 *   - Group rounds: ≤16 picks per submission, ≤1 star
 *   - Knockout rounds: every match in the round required; ≤1 star
 *   - If knockout + home_score == away_score → if_draw_winner required & must match
 *     one of the two team_codes
 *   - Round must not be locked (first match kickoff_at not yet passed)
 *   - Upsert on (profile_id, match_id)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

const VALID_ROUNDS = new Set([
  'group_r1', 'group_r2', 'group_r3',
  'r32', 'r16', 'qf', 'sf', 'final',
])
const GROUP_ROUNDS = new Set(['group_r1', 'group_r2', 'group_r3'])
const ROUND_EXPECTED_COUNT: Record<string, number> = {
  group_r1: 24, group_r2: 24, group_r3: 24,
  r32: 16, r16: 8, qf: 4, sf: 2, final: 2,
}

interface PickInput {
  match_id: string
  home_score: number
  away_score: number
  if_draw_winner?: string | null
  is_star?: boolean
}

function badRequest(message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { round_code?: unknown; picks?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest('invalid_json')
  }

  const roundCode = typeof body.round_code === 'string' ? body.round_code : ''
  if (!VALID_ROUNDS.has(roundCode)) return badRequest('invalid_round_code')
  const isKnockout = !GROUP_ROUNDS.has(roundCode)

  const picksRaw = Array.isArray(body.picks) ? body.picks : null
  if (!picksRaw || picksRaw.length === 0) return badRequest('picks_required')

  // Normalize + per-row shape check
  const picks: PickInput[] = []
  for (const p of picksRaw) {
    if (!p || typeof p !== 'object') return badRequest('pick_shape_invalid')
    const r = p as Record<string, unknown>
    const matchId = typeof r.match_id === 'string' ? r.match_id : ''
    const home = Number(r.home_score)
    const away = Number(r.away_score)
    const ifDraw = typeof r.if_draw_winner === 'string' && r.if_draw_winner.length > 0
      ? r.if_draw_winner : null
    const star = Boolean(r.is_star)
    if (!matchId) return badRequest('pick_missing_match_id')
    if (!Number.isInteger(home) || home < 0 || home > 15) return badRequest('pick_home_score_invalid', { match_id: matchId })
    if (!Number.isInteger(away) || away < 0 || away > 15) return badRequest('pick_away_score_invalid', { match_id: matchId })
    picks.push({ match_id: matchId, home_score: home, away_score: away, if_draw_winner: ifDraw, is_star: star })
  }

  // Duplicate match_id check
  const seen = new Set<string>()
  for (const p of picks) {
    if (seen.has(p.match_id)) return badRequest('duplicate_match_id', { match_id: p.match_id })
    seen.add(p.match_id)
  }

  // Star cap
  const starCount = picks.filter((p) => p.is_star).length
  if (starCount > 1) return badRequest('too_many_stars', { stars: starCount, max: 1 })

  // Cap per-round count
  if (GROUP_ROUNDS.has(roundCode) && picks.length > 16) {
    return badRequest('group_round_max_16_picks', { received: picks.length })
  }
  if (isKnockout && picks.length !== ROUND_EXPECTED_COUNT[roundCode]) {
    return badRequest('knockout_round_all_matches_required', {
      received: picks.length,
      expected: ROUND_EXPECTED_COUNT[roundCode],
    })
  }

  const sb = predictorAdmin()

  // Pull matches for this round to validate ownership + kickoff lock
  const { data: matchRows, error: matchErr } = await sb
    .from('predictor_matches')
    .select('id, round_code, home_team_code, away_team_code, kickoff_at')
    .eq('round_code', roundCode)
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })

  const matchById = new Map((matchRows || []).map((m) => [m.id, m]))

  for (const p of picks) {
    const mt = matchById.get(p.match_id)
    if (!mt) return badRequest('match_not_in_round', { match_id: p.match_id, round_code: roundCode })
    if (isKnockout && p.home_score === p.away_score) {
      if (!p.if_draw_winner) {
        return badRequest('if_draw_winner_required', { match_id: p.match_id })
      }
      if (p.if_draw_winner !== mt.home_team_code && p.if_draw_winner !== mt.away_team_code) {
        return badRequest('if_draw_winner_invalid', {
          match_id: p.match_id,
          got: p.if_draw_winner,
          expected_one_of: [mt.home_team_code, mt.away_team_code],
        })
      }
    }
  }

  // Round lock check: lock = first kickoff in round
  if (matchRows && matchRows.length) {
    const firstKickoff = matchRows
      .map((m) => new Date(m.kickoff_at).getTime())
      .sort((a, b) => a - b)[0]
    if (Date.now() >= firstKickoff) {
      return NextResponse.json(
        { error: 'round_locked', round_code: roundCode, locked_at: new Date(firstKickoff).toISOString() },
        { status: 403 }
      )
    }
  }

  // Upsert
  const rows = picks.map((p) => ({
    profile_id: session.profile_id,
    match_id: p.match_id,
    home_score: p.home_score,
    away_score: p.away_score,
    if_draw_winner: p.if_draw_winner,
    is_star: p.is_star ?? false,
  }))

  const { data: saved, error: upsertErr } = await sb
    .from('predictor_picks')
    .upsert(rows, { onConflict: 'profile_id,match_id' })
    .select('match_id, home_score, away_score, if_draw_winner, is_star, updated_at')

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({
    round_code: roundCode,
    saved_count: saved?.length ?? 0,
    picks: saved ?? [],
  })
}
