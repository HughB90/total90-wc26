/**
 * GET /api/admin/predictor/matches
 *
 * Admin-only listing of every WC26 predictor match row. Used by the
 * /admin/predictor/score-match UI to populate the match picker and
 * details panel.
 *
 * Auth: header `x-admin-key: <PREDICTOR_ADMIN_KEY>`.
 *   - 503 if PREDICTOR_ADMIN_KEY not configured
 *   - 401 if header missing / mismatch
 *
 * Response 200:
 *   { ok: true, count: <int>, matches: [ <row>, ... ] }
 *
 * Rows include every column the UI needs:
 *   id, round_code, home_team_code, away_team_code, kickoff_at,
 *   home_score, away_score, went_to_pks, pk_winner_team_code,
 *   goalscorers, status, is_knockout
 *
 * Sorted by kickoff_at ascending.
 */

import { NextResponse } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'
import { validateAdminAuth } from './validate'

export const dynamic = 'force-dynamic'

const SELECT_COLS =
  'id, round_code, home_team_code, away_team_code, kickoff_at, home_score, away_score, went_to_pks, pk_winner_team_code, goalscorers, status, is_knockout'

export async function GET(request: Request) {
  try {
    const auth = validateAdminAuth(request)
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status })
    }

    const sb = predictorAdmin()
    const { data, error } = await sb
      .from('predictor_matches')
      .select(SELECT_COLS)
      .order('kickoff_at', { ascending: true })
      .limit(200)

    if (error) {
      console.error('[admin/predictor/matches] list error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const matches = data ?? []
    return NextResponse.json({
      ok: true,
      count: matches.length,
      matches,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/predictor/matches] unexpected error:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
