/**
 * Shared core for /api/predictor/leaderboard and
 * /api/predictor/leaderboard/me.
 *
 * Both endpoints need to compute the same ranking — the public one
 * slices a page of it, the /me one looks up the caller's row. Keeping
 * the computation in one place means they can't drift.
 *
 * Note: this is intentionally fetched on every request the /me endpoint
 * is hit, because /me is uncached. The /public endpoint is edge-cached
 * (Vercel s-maxage=30) so even ~100 concurrent viewers only hit Supabase
 * a couple of times per minute for the heavy ranking computation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RankedRow {
  rank: number
  profile_id: string
  manager_name: string
  first_name: string
  last_name: string
  total: number
}

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

export interface RankingResult {
  ranked: RankedRow[]
}

export interface RankingError {
  error: string
}

/**
 * Pull every relevant profile + cache row and return the fully-ranked
 * leaderboard. The two route handlers can then paginate it or pluck the
 * caller's row out of it.
 */
export async function computeRanking(
  sb: SupabaseClient,
  opts: { scope: 'global' | 'league'; leagueId?: string | null }
): Promise<RankingResult | RankingError> {
  let profileIds: string[] = []

  if (opts.scope === 'league') {
    if (!opts.leagueId) return { error: 'league_id_required' }
    const { data: members, error } = await sb
      .from('wc26_predictor_league_members')
      .select('profile_id')
      .eq('league_id', opts.leagueId)
    if (error) return { error: error.message }
    profileIds = (members ?? []).map((m) => m.profile_id as string)
  } else {
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
    return { ranked: [] }
  }

  const [profilesRes, cacheRes] = await Promise.all([
    sb.from('profiles').select('id, manager_name, first_name, last_name').in('id', profileIds),
    sb
      .from('predictor_leaderboard_cache')
      .select('profile_id, total_pts, exact_score_pts_only, winner_pick_pts')
      .in('profile_id', profileIds),
  ])

  if (profilesRes.error) return { error: profilesRes.error.message }
  if (cacheRes.error) return { error: cacheRes.error.message }

  const cacheByProfile = new Map<string, CacheRow>()
  for (const c of (cacheRes.data ?? []) as CacheRow[]) {
    cacheByProfile.set(c.profile_id, c)
  }

  const ranked: RankedRow[] = ((profilesRes.data ?? []) as ProfileRow[])
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
        _exact: cache?.exact_score_pts_only ?? 0,
      }
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      if (b._exact !== a._exact) return b._exact - a._exact
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

  return { ranked }
}

/**
 * Public leaderboard cache header. 30s edge cache + 120s SWR window.
 *
 * During live matches the cache is busted naturally every 30s, which is
 * the right granularity (predictor scores only refresh on match-final,
 * not per-goal — so anything tighter is wasted).
 */
export const PUBLIC_LEADERBOARD_CACHE_CONTROL =
  'public, s-maxage=30, stale-while-revalidate=120'

export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
