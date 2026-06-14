/**
 * POST /api/predictor/score-match
 *
 * Score every user's pick for a single finalized match, write per-pick
 * results into `predictor_scores`, and refresh `predictor_leaderboard_cache`
 * for every profile this match touched.
 *
 * Auth: header `x-admin-key: <PREDICTOR_ADMIN_KEY>`.
 * Body: { "match_id": "<text>" }
 *
 * This endpoint is now a thin wrapper around `scoreMatchById` (in
 * `@/lib/predictor/score-match-core`). The cron job (sync-wc26-fixtures)
 * calls the core directly to avoid an extra HTTP roundtrip + cold start.
 * This route is still useful for:
 *   - manual admin retry via curl
 *   - external admin tools that don't share process with the cron
 *
 * Idempotent: safe to re-run.
 */

import { NextResponse } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'
import { scoreMatchById } from '@/lib/predictor/score-match-core'
import { validateScoreMatchRequest } from './validate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const v = await validateScoreMatchRequest(request)
  if (!v.ok) {
    return NextResponse.json(v.body, { status: v.status })
  }

  const sb = predictorAdmin()
  const result = await scoreMatchById(sb, v.matchId)

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, match_id: result.match_id },
      { status: result.status ?? 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    match_id: result.match_id,
    scored_profiles: result.scored_profiles,
    cache_refreshed: result.cache_refreshed,
    match: result.match,
  })
}
