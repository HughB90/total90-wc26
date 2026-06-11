/**
 * GET /api/predictor/leaderboard
 *
 * Edge-cacheable global/league leaderboard. Returns ONLY public data —
 * the caller's per-user rank lives at /api/predictor/leaderboard/me.
 *
 * Query:
 *   - scope=global | league
 *   - league_id (required when scope=league)
 *   - page (default 1, 1-indexed)
 *   - per_page (default 25, max 200)
 *   - limit (legacy / back-compat; if provided, overrides per_page and
 *           returns only the first N rows starting from page 1)
 *
 * Returns:
 *   {
 *     rows: [{ rank, profile_id, manager_name, first_name, last_name, total }],
 *     page, per_page, total_count, total_players,
 *     // The fields below are kept for response-shape back-compat with
 *     // older clients. They are ALWAYS null on this endpoint now — the
 *     // caller's rank is served by /api/predictor/leaderboard/me.
 *     my_rank: null,
 *     my_row:  null
 *   }
 *
 * Cache:
 *   Cache-Control: public, s-maxage=30, stale-while-revalidate=120
 *
 *   The response is identical for every viewer at a given (scope,
 *   league_id, page, per_page) tuple, so Vercel's edge cache keys
 *   naturally split per league / per page.
 *
 * Scoring source:
 *   `total` = predictor_leaderboard_cache.total_pts + .winner_pick_pts
 *   Tiebreakers: total DESC → exact_score_pts_only DESC → manager_name ASC
 *   (see lib/predictor/leaderboard-core.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'
import {
  computeRanking,
  clampInt,
  PUBLIC_LEADERBOARD_CACHE_CONTROL,
} from '@/lib/predictor/leaderboard-core'

// IMPORTANT: do NOT set `dynamic = 'force-dynamic'`. We rely on Vercel
// edge caching the response per URL. The route still runs server-side
// on cache miss; it just isn't pinned to a per-request render.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const scopeRaw = url.searchParams.get('scope') ?? 'global'
  const scope: 'global' | 'league' = scopeRaw === 'league' ? 'league' : 'global'
  const leagueId = url.searchParams.get('league_id')

  // Pagination — legacy `limit` wins if present (back-compat).
  const legacyLimitRaw = url.searchParams.get('limit')
  const hasLegacyLimit = legacyLimitRaw !== null && legacyLimitRaw !== ''
  const page = clampInt(url.searchParams.get('page'), 1, 1, 100000)
  const perPage = hasLegacyLimit
    ? clampInt(legacyLimitRaw, 25, 1, 200)
    : clampInt(url.searchParams.get('per_page'), 25, 1, 200)

  const sb = predictorAdmin()
  const result = await computeRanking(sb, { scope, leagueId })

  if ('error' in result) {
    const status = result.error === 'league_id_required' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }

  const { ranked } = result

  // Legacy `limit` mode: return the first N rows, ignore page param.
  const start = hasLegacyLimit ? 0 : (page - 1) * perPage
  const end = start + perPage
  const rows = ranked.slice(start, end)

  return NextResponse.json(
    {
      rows,
      page,
      per_page: perPage,
      total_count: ranked.length,
      total_players: ranked.length,
      // Back-compat: clients that still read these fields off this
      // endpoint should call /api/predictor/leaderboard/me instead.
      my_rank: null,
      my_row: null,
    },
    {
      headers: {
        'Cache-Control': PUBLIC_LEADERBOARD_CACHE_CONTROL,
      },
    }
  )
}
