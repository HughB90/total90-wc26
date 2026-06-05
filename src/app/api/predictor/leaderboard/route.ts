/**
 * GET /api/predictor/leaderboard
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
 *     rows: [{ rank, profile_id, manager_name, first_name, total }],
 *     page, per_page, total_count, total_players,
 *     my_rank: number | null,
 *     my_row:  { rank, profile_id, manager_name, first_name, total } | null
 *   }
 *
 * `total_players` kept as an alias for `total_count` so older callers
 * that still read `total_players` don't break.
 *
 * Scoring source (2026-06-04, Wave D wired):
 *   `total` is read from `predictor_leaderboard_cache.total_pts`.
 *   That cache is refreshed by POST /api/predictor/score-match every
 *   time a match is scored. Profiles with no cache row (have picks but
 *   no match has been scored yet) appear with total = 0.
 *
 * Tiebreaker ladder (this pass):
 *   1. total_pts DESC
 *   2. exact_score_pts_only DESC  (sum of pure exact-score points,
 *      tracked separately in the cache)
 *   3. manager_name ASC (stable alphabetical)
 *
 * TODO (next migration): add `correct_results_count` to
 * predictor_leaderboard_cache so we can implement tiebreaker #3 per
 * the full spec ("most correct results") before falling back to name.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

interface ProfileRow {
  id: string
  manager_name: string | null
  first_name: string | null
  last_name: string | null
}

interface CacheRow {
  profile_id: string
  total_pts: number | null
  exact_score_pts_only: number | null
  winner_pick_pts: number | null
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'global'
  const leagueId = url.searchParams.get('league_id')

  // Pagination — legacy `limit` wins if present (back-compat).
  const legacyLimitRaw = url.searchParams.get('limit')
  const hasLegacyLimit = legacyLimitRaw !== null && legacyLimitRaw !== ''
  const page = clampInt(url.searchParams.get('page'), 1, 1, 100000)
  const perPage = hasLegacyLimit
    ? clampInt(legacyLimitRaw, 25, 1, 200)
    : clampInt(url.searchParams.get('per_page'), 25, 1, 200)

  const sb = predictorAdmin()
  const session = await getProfileSession()

  let profileIds: string[] = []

  if (scope === 'league') {
    if (!leagueId) {
      return NextResponse.json({ error: 'league_id_required' }, { status: 400 })
    }
    const { data: members, error } = await sb
      .from('wc26_predictor_league_members')
      .select('profile_id')
      .eq('league_id', leagueId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    profileIds = (members ?? []).map((m) => m.profile_id)
  } else {
    // Global: every profile that has at least one predictor pick OR a winner pick.
    const [pickProfiles, winnerProfiles] = await Promise.all([
      sb.from('predictor_picks').select('profile_id'),
      sb.from('predictor_winner_picks').select('profile_id'),
    ])
    const ids = new Set<string>()
    for (const p of pickProfiles.data ?? []) ids.add(p.profile_id as string)
    for (const p of winnerProfiles.data ?? []) ids.add(p.profile_id as string)
    profileIds = Array.from(ids)
  }

  if (profileIds.length === 0) {
    return NextResponse.json({
      rows: [],
      page,
      per_page: perPage,
      total_count: 0,
      total_players: 0,
      my_rank: null,
      my_row: null,
    })
  }

  // Pull profiles + cache rows in parallel.
  const [profilesRes, cacheRes] = await Promise.all([
    sb.from('profiles').select('id, manager_name, first_name, last_name').in('id', profileIds),
    sb
      .from('predictor_leaderboard_cache')
      .select('profile_id, total_pts, exact_score_pts_only, winner_pick_pts')
      .in('profile_id', profileIds),
  ])

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })
  }
  if (cacheRes.error) {
    return NextResponse.json({ error: cacheRes.error.message }, { status: 500 })
  }

  // Index cache by profile_id; missing profiles = 0 across the board.
  const cacheByProfile = new Map<string, CacheRow>()
  for (const c of (cacheRes.data ?? []) as CacheRow[]) {
    cacheByProfile.set(c.profile_id, c)
  }

  const ranked = ((profilesRes.data ?? []) as ProfileRow[])
    .map((p) => {
      const cache = cacheByProfile.get(p.id)
      const matchTotal = cache?.total_pts ?? 0
      const winnerBonus = cache?.winner_pick_pts ?? 0
      return {
        profile_id: p.id,
        manager_name: p.manager_name ?? p.first_name ?? 'Manager',
        first_name: p.first_name ?? '',
        last_name: p.last_name ?? '',
        total: matchTotal + winnerBonus,
        // Tiebreaker buckets (not exposed in response shape).
        _exact: cache?.exact_score_pts_only ?? 0,
      }
    })
    .sort((a, b) => {
      // 1. total DESC
      if (b.total !== a.total) return b.total - a.total
      // 2. exact_score_pts_only DESC
      if (b._exact !== a._exact) return b._exact - a._exact
      // 3. manager_name ASC (stable alphabetical)
      return a.manager_name.localeCompare(b.manager_name)
    })
    .map((r, i) => ({
      rank: i + 1,
      profile_id: r.profile_id,
      manager_name: r.manager_name,
      first_name: r.first_name,
      last_name: r.last_name,
      total: r.total,
    }))

  // Legacy `limit` mode: return the first N rows, ignore page param.
  // Otherwise standard pagination starting at page 1.
  const start = hasLegacyLimit ? 0 : (page - 1) * perPage
  const end = start + perPage
  const rows = ranked.slice(start, end)

  let myRow: typeof ranked[number] | null = null
  let myRank: number | null = null
  if (session) {
    const found = ranked.find((r) => r.profile_id === session.profile_id)
    if (found) {
      myRow = found
      myRank = found.rank
    }
  }

  return NextResponse.json({
    rows,
    page,
    per_page: perPage,
    total_count: ranked.length,
    // Kept for back-compat with the original response shape.
    total_players: ranked.length,
    my_rank: myRank,
    my_row: myRow,
  })
}
