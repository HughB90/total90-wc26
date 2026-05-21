/**
 * POST /api/predictor/picks
 *
 * Submit/update a batch of picks for a single round.
 *
 * Body: {
 *   round_code: 'group_r1' | 'group_r2' | 'group_r3' | 'r32' | 'r16' | 'qf' | 'sf' | 'final',
 *   picks: [{ match_id, home_score, away_score, if_draw_winner?, is_star, goalscorer_id? }]
 * }
 *
 * Validation (spec amendments 2026-05-20):
 *   - Session required
 *   - Every match_id must belong to round_code
 *   - Group rounds: ≤16 picks per submission, ≤1 star per round
 *   - Knockout rounds: every match in the round required; ≤1 star per round
 *   - Stars only allowed if round.stars_enabled (R1–R4)
 *   - Tournament-wide star cap: 4 stars total per profile
 *   - Goalscorer picks only accepted if round.scorer_enabled (R5–R8)
 *   - If knockout + home_score == away_score → if_draw_winner required & must match
 *     one of the two team_codes
 *   - Lock check uses canonical round.lock_iso (1 min before first kickoff)
 *   - Upsert on (profile_id, match_id)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import { getRound, isRoundLocked, TOURNAMENT_STAR_CAP, KNOCKOUT_ROUND_CODES } from '@/lib/predictor-rounds'

export const dynamic = 'force-dynamic'

interface PickInput {
  match_id: string
  home_score: number
  away_score: number
  if_draw_winner?: string | null
  is_star?: boolean
  goalscorer_id?: string | null
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
  const round = getRound(roundCode)
  if (!round) return badRequest('invalid_round_code')
  const isKnockout = KNOCKOUT_ROUND_CODES.has(round.code)

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
    const scorer = typeof r.goalscorer_id === 'string' && r.goalscorer_id.length > 0
      ? r.goalscorer_id : null
    if (!matchId) return badRequest('pick_missing_match_id')
    if (!Number.isInteger(home) || home < 0 || home > 15) return badRequest('pick_home_score_invalid', { match_id: matchId })
    if (!Number.isInteger(away) || away < 0 || away > 15) return badRequest('pick_away_score_invalid', { match_id: matchId })
    picks.push({
      match_id: matchId,
      home_score: home,
      away_score: away,
      if_draw_winner: ifDraw,
      is_star: star,
      goalscorer_id: scorer,
    })
  }

  // Duplicate match_id check
  const seen = new Set<string>()
  for (const p of picks) {
    if (seen.has(p.match_id)) return badRequest('duplicate_match_id', { match_id: p.match_id })
    seen.add(p.match_id)
  }

  // Per-round star cap (≤1)
  const starsInBatch = picks.filter((p) => p.is_star).length
  if (starsInBatch > 1) return badRequest('too_many_stars', { stars: starsInBatch, max: 1 })

  // Stars disallowed in R5–R8
  if (!round.stars_enabled && starsInBatch > 0) {
    return badRequest('stars_not_allowed_this_round', { round_code: round.code })
  }

  // Scorer disallowed outside R5–R8
  if (!round.scorer_enabled && picks.some((p) => p.goalscorer_id)) {
    return badRequest('scorer_not_allowed_this_round', { round_code: round.code })
  }

  // Per-round count caps
  if (!isKnockout && picks.length > 16) {
    return badRequest('group_round_max_16_picks', { received: picks.length })
  }
  if (isKnockout && picks.length !== round.required) {
    return badRequest('knockout_round_all_matches_required', {
      received: picks.length,
      expected: round.required,
    })
  }

  // Round lock check (canonical: 1 min before first kickoff)
  if (isRoundLocked(round)) {
    return NextResponse.json(
      { error: 'round_locked', round_code: round.code, locked_at: round.lock_iso },
      { status: 403 }
    )
  }

  const sb = predictorAdmin()

  // Pull matches for this round to validate ownership + draw rules
  const { data: matchRows, error: matchErr } = await sb
    .from('predictor_matches')
    .select('id, round_code, home_team_code, away_team_code, kickoff_at')
    .eq('round_code', round.code)
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 })

  const matchById = new Map((matchRows || []).map((m) => [m.id, m]))

  for (const p of picks) {
    const mt = matchById.get(p.match_id)
    if (!mt) return badRequest('match_not_in_round', { match_id: p.match_id, round_code: round.code })
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

  // Tournament-wide star cap (4 total across R1–R4).
  // Count existing stars on OTHER rounds belonging to this profile, then add
  // the stars in this batch.
  if (starsInBatch > 0) {
    const matchIds = (matchRows ?? []).map((m) => m.id)
    const { data: otherStars, error: starErr } = await sb
      .from('predictor_picks')
      .select('match_id, is_star')
      .eq('profile_id', session.profile_id)
      .eq('is_star', true)
      .not('match_id', 'in', `(${matchIds.length ? matchIds.map((id) => `"${id}"`).join(',') : '""'})`)
    if (starErr) {
      // Soft-fail: log + carry on (don't block submit). Cap is best-effort.
      console.error('predictor.picks: tournament star count fetch failed', starErr)
    } else {
      const totalStars = (otherStars?.length ?? 0) + starsInBatch
      if (totalStars > TOURNAMENT_STAR_CAP) {
        return badRequest('tournament_star_cap_exceeded', {
          existing: otherStars?.length ?? 0,
          in_batch: starsInBatch,
          cap: TOURNAMENT_STAR_CAP,
        })
      }
    }
  }

  // Upsert. goalscorer_id column added in 2026-05-21 migration; gracefully
  // tolerate its absence (older preview DBs) by stripping the field if the
  // upsert fails with an unknown-column error.
  const rows = picks.map((p) => ({
    profile_id: session.profile_id,
    match_id: p.match_id,
    home_score: p.home_score,
    away_score: p.away_score,
    if_draw_winner: p.if_draw_winner,
    is_star: p.is_star ?? false,
    goalscorer_id: p.goalscorer_id ?? null,
  }))

  let saved: unknown[] | null = null
  let upsertErr: { message: string; code?: string } | null = null
  {
    const res = await sb
      .from('predictor_picks')
      .upsert(rows, { onConflict: 'profile_id,match_id' })
      .select('match_id, home_score, away_score, if_draw_winner, is_star, goalscorer_id, updated_at')
    saved = res.data ?? null
    upsertErr = res.error
  }

  if (upsertErr && /goalscorer_id|column .* does not exist/i.test(upsertErr.message)) {
    // Retry without scorer column
    const fallbackRows = rows.map(({ goalscorer_id: _g, ...rest }) => rest)
    const res2 = await sb
      .from('predictor_picks')
      .upsert(fallbackRows, { onConflict: 'profile_id,match_id' })
      .select('match_id, home_score, away_score, if_draw_winner, is_star, updated_at')
    saved = res2.data ?? null
    upsertErr = res2.error
  }

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({
    round_code: round.code,
    saved_count: saved?.length ?? 0,
    picks: saved ?? [],
  })
}
