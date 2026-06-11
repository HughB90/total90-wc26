/**
 * GET /api/predictor/leaderboard/me
 *
 * Per-user complement to /api/predictor/leaderboard. Returns the
 * caller's rank + row in the global or league ranking. NOT cached —
 * the answer depends on which signed-in profile is asking.
 *
 * Why split: the global rows are identical for every viewer (so they
 * cache at the edge), but "where do I rank?" is user-specific and must
 * stay dynamic. Volume is fine — one row of work per request, and only
 * signed-in users see this endpoint.
 *
 * Query:
 *   - scope=global | league   (default global)
 *   - league_id (required when scope=league)
 *
 * Returns:
 *   {
 *     scope, league_id,
 *     my_rank: number | null,
 *     my_row: {
 *       rank, profile_id, manager_name, first_name, last_name, total
 *     } | null
 *   }
 *
 * Anonymous callers get { my_rank: null, my_row: null }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import { computeRanking } from '@/lib/predictor/leaderboard-core'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const scopeRaw = url.searchParams.get('scope') ?? 'global'
  const scope: 'global' | 'league' = scopeRaw === 'league' ? 'league' : 'global'
  const leagueId = url.searchParams.get('league_id')

  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({
      scope,
      league_id: leagueId,
      my_rank: null,
      my_row: null,
    })
  }

  const sb = predictorAdmin()
  const result = await computeRanking(sb, { scope, leagueId })

  if ('error' in result) {
    const status = result.error === 'league_id_required' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }

  const found = result.ranked.find((r) => r.profile_id === session.profile_id) ?? null

  return NextResponse.json({
    scope,
    league_id: leagueId,
    my_rank: found?.rank ?? null,
    my_row: found,
  })
}
