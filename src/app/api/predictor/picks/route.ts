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
 *   - Per-match kickoff lock: any pick whose match's kickoff_at <= now is
 *     rejected (atomic reject for the whole batch). UI greys these out so
 *     the client shouldn't send them; this is the server-side guard.
 *   - Persisted-set cap: group rounds may have AT MOST 16 picks total per
 *     (profile_id, round) in the DB. Edits to existing match_ids are fine
 *     (no count change); new match_ids that would push the total over 16
 *     are rejected. Fixes the Jeff McMenis 17-pick bug (2026-06-11) where
 *     the old route only validated the incoming batch, not the union with
 *     already-persisted picks.
 *   - Star pick rule: 1 star total. If the user has a star on a now-locked
 *     match, the star is FROZEN — they cannot move it or clear it.
 *   - Upsert on (profile_id, match_id)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import {
  checkPersistedSetCap,
  checkStarRule,
  splitByMatchLock,
  GROUP_ROUND_CAP,
} from '@/lib/predictor-pick-validation'

/**
 * DELETE /api/predictor/picks
 *
 * Drop one or more saved picks for a round. Used by the "✕ clear" affordance
 * on the round page so users can swap which 16 matches they've picked in a
 * group round (the persisted-set cap blocks adding a 17th, so they have to
 * drop one first).
 *
 * Body: { round_code, match_ids: string[] }
 *
 * Rules:
 *   - Session required.
 *   - Every match_id must belong to round_code.
 *   - Per-match lock: cannot drop a pick whose match has kicked off
 *     (kickoff_at <= now or status != 'scheduled'). The star-lock rule
 *     in the upsert path already forbids clearing a locked-star; we mirror
 *     that here for ALL locked matches, not just stars, since the score is
 *     also frozen post-kickoff.
 */
export async function DELETE(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { round_code?: unknown; match_ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return badRequest('invalid_json')
  }

  const roundCode = typeof body.round_code === 'string' ? body.round_code : ''
  if (!VALID_ROUNDS.has(roundCode)) return badRequest('invalid_round_code')

  const matchIdsRaw = Array.isArray(body.match_ids) ? body.match_ids : null
  if (!matchIdsRaw || matchIdsRaw.length === 0) return badRequest('match_ids_required')
  const matchIds: string[] = []
  for (const x of matchIdsRaw) {
    if (typeof x !== 'string' || !x) return badRequest('match_id_invalid')
    matchIds.push(x)
  }

  const sb = predictorAdmin()

  // Verify all match_ids belong to roundCode and pull lock info
  const { data: matchRows, error: mErr } = await sb
    .from('predictor_matches')
    .select('id, round_code, kickoff_at, status')
    .in('id', matchIds)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
  const byId = new Map((matchRows ?? []).map((m) => [m.id, m]))
  for (const id of matchIds) {
    const m = byId.get(id)
    if (!m) return badRequest('match_not_found', { match_id: id })
    if (m.round_code !== roundCode) return badRequest('match_round_mismatch', { match_id: id, expected_round: roundCode })
  }

  // Per-match lock guard
  const nowMs = Date.now()
  const locked: Array<{ match_id: string; kickoff_at: string | null }> = []
  for (const id of matchIds) {
    const m = byId.get(id)!
    const koMs = new Date(m.kickoff_at).getTime()
    const statusLocks = !!m.status && m.status !== 'scheduled'
    if (Number.isNaN(koMs) || koMs <= nowMs || statusLocks) {
      locked.push({ match_id: id, kickoff_at: m.kickoff_at })
    }
  }
  if (locked.length > 0) {
    return NextResponse.json(
      { error: 'match_locked', round_code: roundCode, locked },
      { status: 403 }
    )
  }

  const { data: deleted, error: delErr } = await sb
    .from('predictor_picks')
    .delete()
    .eq('profile_id', session.profile_id)
    .in('match_id', matchIds)
    .select('match_id')
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({
    round_code: roundCode,
    cleared_count: deleted?.length ?? 0,
    match_ids: (deleted ?? []).map((d) => d.match_id),
  })
}

export const dynamic = 'force-dynamic'

const VALID_ROUNDS = new Set([
  'group_r1', 'group_r2', 'group_r3',
  'r32', 'r16', 'qf', 'sf', 'final',
])
const GROUP_ROUNDS = new Set(['group_r1', 'group_r2', 'group_r3'])
// Stars apply to Rounds 1–4 only (group_r1/r2/r3 + r32). R5–R8 use the
// Anytime Goalscorer pick instead — see PREDICTOR-WAVE-C-AMEND-GOALSCORER.md.
const NO_STAR_ROUNDS = new Set(['r16', 'qf', 'sf', 'final'])
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

  // Stars are not allowed on R5–R8 (defensive — UI hides the toggle, but a
  // raw client could still try). Reject before the upsert.
  if (NO_STAR_ROUNDS.has(roundCode) && starCount > 0) {
    return badRequest('stars_not_allowed_in_round', { round_code: roundCode })
  }

  // Per-batch cap (cheap upfront sanity — persisted-set cap below is the
  // real guard, but this catches obvious abuse before we hit the DB).
  if (GROUP_ROUNDS.has(roundCode) && picks.length > GROUP_ROUND_CAP) {
    return badRequest('group_round_max_16_picks', { received: picks.length })
  }
  // Knockout batch sanity: cannot exceed the round's match count. The
  // "all matches required" check happens AFTER we load persisted picks,
  // so partial-batch edits (e.g. saving 15 unlocked picks when 1 match is
  // already final + persisted) are allowed.
  if (isKnockout && picks.length > ROUND_EXPECTED_COUNT[roundCode]) {
    return badRequest('knockout_round_too_many_picks', {
      received: picks.length,
      expected: ROUND_EXPECTED_COUNT[roundCode],
    })
  }

  const sb = predictorAdmin()

  // Pull matches for this round to validate ownership + kickoff lock
  const { data: matchRows, error: matchErr } = await sb
    .from('predictor_matches')
    .select('id, round_code, home_team_code, away_team_code, kickoff_at, status')
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

  // Per-match kickoff lock (atomic reject the whole batch on any locked
  // match). UI is supposed to grey these out — this is the server guard.
  const lockSplit = splitByMatchLock(
    picks.map((p) => ({ match_id: p.match_id, is_star: p.is_star })),
    (matchRows || []).map((m) => ({ id: m.id, round_code: m.round_code, kickoff_at: m.kickoff_at, status: m.status })),
  )
  if (lockSplit.lockedDetails.length > 0) {
    return NextResponse.json(
      {
        error: 'match_locked',
        round_code: roundCode,
        locked: lockSplit.lockedDetails,
      },
      { status: 403 }
    )
  }

  // Pull this user's existing picks in this round (matches scoped to the
  // round above) to enforce the persisted-set cap + star-lock rule.
  const roundMatchIds = (matchRows || []).map((m) => m.id)
  let existingPicks: Array<{ match_id: string; is_star: boolean }> = []
  if (roundMatchIds.length > 0) {
    const { data: existing, error: existErr } = await sb
      .from('predictor_picks')
      .select('match_id, is_star')
      .eq('profile_id', session.profile_id)
      .in('match_id', roundMatchIds)
    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 })
    existingPicks = (existing || []).map((p) => ({
      match_id: p.match_id as string,
      is_star: Boolean(p.is_star),
    }))
  }

  // Knockout coverage check: the UNION of persisted picks + this batch
  // must cover every match in the round. This replaces the old "batch
  // must contain all matches" rule, which broke partial edits once any
  // match locked (the UI strips locked matches from the POST payload).
  // Bug fix 2026-06-29: R32 user with 16/16 picks + Match 73 final could
  // never re-save because batch was 15 and rule rejected.
  if (isKnockout) {
    const expected = ROUND_EXPECTED_COUNT[roundCode]
    const coverage = new Set<string>()
    for (const e of existingPicks) coverage.add(e.match_id)
    for (const p of picks) coverage.add(p.match_id)
    if (coverage.size !== expected) {
      return NextResponse.json(
        {
          error: 'knockout_round_all_matches_required',
          covered: coverage.size,
          expected,
        },
        { status: 400 }
      )
    }
  }

  // Persisted-set cap (group rounds only — knockouts use the union
  // coverage check above). This is THE fix for the 17-pick bug.
  const capResult = checkPersistedSetCap(
    roundCode,
    existingPicks,
    picks.map((p) => ({ match_id: p.match_id, is_star: p.is_star })),
  )
  if (!capResult.ok) {
    return NextResponse.json(
      {
        error: 'pick_cap_exceeded',
        max: GROUP_ROUND_CAP,
        current: capResult.current,
        projected: capResult.projected,
        new_additions: capResult.newAdditions,
      },
      { status: 400 }
    )
  }

  // Star-lock rule: if the user has a star on a locked match, that star is
  // frozen — they cannot move it or clear it.
  const starCheck = checkStarRule({
    existing: existingPicks,
    incoming: picks.map((p) => ({ match_id: p.match_id, is_star: p.is_star })),
    matches: (matchRows || []).map((m) => ({ id: m.id, round_code: m.round_code, kickoff_at: m.kickoff_at, status: m.status })),
  })
  if (!starCheck.ok) {
    return NextResponse.json(
      { error: starCheck.reason, ...(starCheck.details || {}) },
      { status: 403 }
    )
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
