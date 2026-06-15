/**
 * POST /api/predictor/score-match
 *
 * Score every user's pick for a single finalized match, write per-pick
 * results into `predictor_scores`, and refresh `predictor_leaderboard_cache`
 * for every profile this match touched.
 *
 * ARCHITECTURE NOTE (2026-06-15):
 *   This route is a thin HTTP wrapper around `scoreMatchById()` from
 *   `@/lib/predictor/score-match-core`. The core function exists so cron
 *   handlers can invoke scoring **in-process** instead of via fetch — which
 *   was getting bounced by Vercel deployment protection on preview URLs and
 *   silently failing for 5 matches on 2026-06-14. Behavior and response
 *   shape here are intentionally identical to the legacy handler.
 *
 * Auth (Pass 1, mirrors /api/admin/bracket/recompute):
 *   Header `x-admin-key: <PREDICTOR_ADMIN_KEY>`.
 *   PREDICTOR_ADMIN_KEY is its OWN env var (not bracket's). Unset → 503.
 *
 * Body: { "match_id": "<text>" }
 *
 * Response 200:
 *   {
 *     ok: true,
 *     match_id,
 *     scored_profiles: <int>,   // # predictor_scores rows upserted
 *     cache_refreshed: <int>,   // # predictor_leaderboard_cache rows updated
 *     match: {
 *       round_code, home_team_code, away_team_code,
 *       home_score, away_score, went_to_pks, pk_winner_team_code,
 *       goalscorer_count
 *     }
 *   }
 *
 * Error codes:
 *   400 — missing/invalid body or match_id
 *   401 — bad x-admin-key
 *   404 — match_id not found
 *   422 — match not finalized (home_score or away_score is null)
 *   500 — unexpected DB error
 *   503 — PREDICTOR_ADMIN_KEY env var not configured
 *
 * Idempotency:
 *   Safe to re-run. predictor_scores upserts by (profile_id, match_id);
 *   leaderboard cache is fully re-summed per affected profile from
 *   predictor_scores (NOT incrementally added).
 */

import { NextResponse } from 'next/server'
import { scoreMatchById } from '@/lib/predictor/score-match-core'
import { validateScoreMatchRequest } from './validate'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const v = await validateScoreMatchRequest(request)
    if (!v.ok) {
      return NextResponse.json(v.body, { status: v.status })
    }

    const result = await scoreMatchById(v.matchId)

    if (!result.ok) {
      const body: { ok: false; error: string; detail?: string } = {
        ok: false,
        error: result.error,
      }
      if (result.detail) body.detail = result.detail
      return NextResponse.json(body, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      match_id: result.match_id,
      scored_profiles: result.scored_profiles,
      cache_refreshed: result.cache_refreshed,
      match: result.match,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[score-match] unexpected error:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
