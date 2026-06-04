/**
 * PATCH /api/admin/predictor/matches/[id]
 *
 * Admin-only manual edit of a single predictor_matches row. Used by the
 * /admin/predictor/score-match UI to set scores, knockout PK info, and
 * goalscorers before triggering the live scoring pipeline.
 *
 * Auth: header `x-admin-key: <PREDICTOR_ADMIN_KEY>`.
 *   - 503 if env var unset
 *   - 401 if header missing / mismatch
 *
 * Body (all fields optional, any subset accepted):
 *   {
 *     "home_score": int|null,
 *     "away_score": int|null,
 *     "went_to_pks": bool,
 *     "pk_winner_team_code": string|null,
 *     "goalscorers": <jsonb array>,
 *     "status": string
 *   }
 *
 * Validation: TYPE checks only. NO business rules (this is admin/test
 * tooling — Hugh can enter anything). The scoring endpoint will refuse
 * to score an obviously-incomplete row, which is the right gate.
 *
 * Response 200:
 *   { ok: true, match: <updated row> }
 *
 * Error codes:
 *   400 — invalid JSON body
 *   401 — bad x-admin-key
 *   404 — match_id not found
 *   422 — body shape / type violation
 *   500 — unexpected DB error
 *   503 — PREDICTOR_ADMIN_KEY env var not configured
 */

import { NextResponse, type NextRequest } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'
import { validateAdminAuth, validateMatchPatchBody } from '../validate'

export const dynamic = 'force-dynamic'

const SELECT_COLS =
  'id, round_code, home_team_code, away_team_code, kickoff_at, home_score, away_score, went_to_pks, pk_winner_team_code, goalscorers, status, is_knockout'

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = validateAdminAuth(request)
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status })
    }

    const { id } = await ctx.params
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'match_id_required' },
        { status: 422 },
      )
    }

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json(
        { ok: false, error: 'invalid_json_body' },
        { status: 400 },
      )
    }

    const parsed = validateMatchPatchBody(rawBody)
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status })
    }

    const sb = predictorAdmin()

    // Confirm match exists first so we can distinguish 404 from "0 rows updated".
    const { data: existing, error: lookupErr } = await sb
      .from('predictor_matches')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (lookupErr) {
      console.error('[admin/predictor/matches PATCH] lookup error:', lookupErr.message)
      return NextResponse.json({ ok: false, error: lookupErr.message }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'match_not_found' }, { status: 404 })
    }

    const updatePayload: Record<string, unknown> = {
      ...parsed.update,
      updated_at: new Date().toISOString(),
    }

    const { data: updated, error: updateErr } = await sb
      .from('predictor_matches')
      .update(updatePayload)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()

    if (updateErr) {
      console.error('[admin/predictor/matches PATCH] update error:', updateErr.message)
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })
    }

    console.log(
      `[admin/predictor/matches PATCH] match=${id} updated fields=${Object.keys(parsed.update).join(',')}`,
    )

    return NextResponse.json({ ok: true, match: updated })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/predictor/matches PATCH] unexpected error:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
