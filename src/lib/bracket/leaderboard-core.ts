/**
 * Shared core for /api/bracket/leaderboard and
 * /api/bracket/leaderboard/me.
 *
 * The public endpoint slices a page out of the ranked list and is
 * edge-cacheable. The /me endpoint pulls the caller's row from the
 * same ranking and stays uncached.
 *
 * Implementation note: we deliberately recompute the full ranking on
 * every cache miss / /me hit. Total participants are in the hundreds,
 * not millions, so this is cheap; what we care about is collapsing the
 * polling pressure during live matches via the edge cache.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ProfileRow = {
  id: string
  manager_name: string | null
  first_name: string | null
  display_name: string | null
  created_at: string
  deleted_at: string | null
}

export type LegacyUserRow = {
  id: string
  display_name: string | null
  first_name: string | null
  created_at: string
}

export type AggregatedRow = {
  userId: string
  profileId: string | null
  managerName: string
  firstName: string | null
  displayName: string
  score: number
  createdAt: string
}

export type RankedRow = AggregatedRow & { rank: number }

export interface RankingError {
  error: string
  status: number
}

export interface RankingResult {
  ranked: RankedRow[]
}

/** Global ranking (every active profile + every non-migrated legacy user). */
export async function computeGlobalRanking(
  supabase: SupabaseClient
): Promise<RankingResult | RankingError> {
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, manager_name, first_name, display_name, created_at, deleted_at')
    .is('deleted_at', null)
  if (profErr) return { error: profErr.message, status: 500 }

  const { data: legacyUsers, error: legacyErr } = await (supabase
    .from('bracket_users')
    .select('id, display_name, first_name, created_at') as any)
  if (legacyErr) return { error: legacyErr.message, status: 500 }

  const { data: entries, error: entryErr } = await supabase
    .from('bracket_entries')
    .select('user_id, profile_id, score')
  if (entryErr) return { error: entryErr.message, status: 500 }

  const scoreByProfile = new Map<string, number>()
  const scoreByLegacy = new Map<string, number>()
  const migratedLegacyIds = new Set<string>()
  for (const e of (entries ?? []) as Array<{
    user_id: string | null
    profile_id: string | null
    score: number | null
  }>) {
    const s = e.score ?? 0
    if (e.profile_id) {
      scoreByProfile.set(e.profile_id, (scoreByProfile.get(e.profile_id) ?? 0) + s)
      if (e.user_id) migratedLegacyIds.add(e.user_id)
    } else if (e.user_id) {
      scoreByLegacy.set(e.user_id, (scoreByLegacy.get(e.user_id) ?? 0) + s)
    }
  }

  const all: AggregatedRow[] = []

  for (const p of (profiles ?? []) as ProfileRow[]) {
    all.push({
      userId: p.id,
      profileId: p.id,
      managerName: p.manager_name || p.display_name || p.first_name || 'Anonymous',
      firstName: p.first_name,
      displayName: p.display_name || p.manager_name || p.first_name || 'Anonymous',
      score: scoreByProfile.get(p.id) ?? 0,
      createdAt: p.created_at,
    })
  }

  for (const u of (legacyUsers ?? []) as LegacyUserRow[]) {
    if (migratedLegacyIds.has(u.id)) continue
    all.push({
      userId: u.id,
      profileId: null,
      managerName: u.display_name || u.first_name || 'Anonymous',
      firstName: u.first_name,
      displayName: u.display_name || u.first_name || 'Anonymous',
      score: scoreByLegacy.get(u.id) ?? 0,
      createdAt: u.created_at,
    })
  }

  return { ranked: rankAndSort(all) }
}

/** League ranking — every member of a league by invite code. */
export async function computeLeagueRanking(
  supabase: SupabaseClient,
  leagueCode: string
): Promise<RankingResult | RankingError> {
  const { data: league } = await supabase
    .from('wc26_leagues')
    .select('id')
    .eq('invite_code', leagueCode.toUpperCase())
    .single()

  if (!league) return { error: 'League not found', status: 404 }

  const { data: members } = await (supabase
    .from('wc26_league_members')
    .select('user_id, profile_id')
    .eq('league_id', league.id) as any)

  const memberProfileIds = (members ?? [])
    .map((m: { profile_id: string | null }) => m.profile_id)
    .filter((x: string | null): x is string => !!x)
  const memberLegacyIds = (members ?? [])
    .map((m: { user_id: string | null; profile_id: string | null }) =>
      m.profile_id ? null : m.user_id
    )
    .filter((x: string | null): x is string => !!x)

  if (memberProfileIds.length === 0 && memberLegacyIds.length === 0) {
    return { ranked: [] }
  }

  const profilesPromise = memberProfileIds.length
    ? supabase
        .from('profiles')
        .select('id, manager_name, first_name, display_name, created_at, deleted_at')
        .in('id', memberProfileIds)
    : Promise.resolve({ data: [] as ProfileRow[] })

  const legacyPromise = memberLegacyIds.length
    ? (supabase
        .from('bracket_users')
        .select('id, display_name, first_name, created_at')
        .in('id', memberLegacyIds) as any)
    : Promise.resolve({ data: [] as LegacyUserRow[] })

  const [{ data: profiles }, { data: legacyUsers }] = await Promise.all([
    profilesPromise,
    legacyPromise,
  ])

  const orParts: string[] = []
  if (memberProfileIds.length) orParts.push(`profile_id.in.(${memberProfileIds.join(',')})`)
  if (memberLegacyIds.length) orParts.push(`user_id.in.(${memberLegacyIds.join(',')})`)
  const entriesRes = orParts.length
    ? await (supabase.from('bracket_entries').select('user_id, profile_id, score').or(orParts.join(',')) as any)
    : { data: [] as Array<{ user_id: string | null; profile_id: string | null; score: number | null }> }
  const entries = (entriesRes as { data: Array<{ user_id: string | null; profile_id: string | null; score: number | null }> | null }).data

  const scoreByProfile = new Map<string, number>()
  const scoreByLegacy = new Map<string, number>()
  for (const e of entries ?? []) {
    const s = e.score ?? 0
    if (e.profile_id) scoreByProfile.set(e.profile_id, (scoreByProfile.get(e.profile_id) ?? 0) + s)
    else if (e.user_id) scoreByLegacy.set(e.user_id, (scoreByLegacy.get(e.user_id) ?? 0) + s)
  }

  const all: AggregatedRow[] = []
  for (const p of (profiles ?? []) as ProfileRow[]) {
    all.push({
      userId: p.id,
      profileId: p.id,
      managerName: p.manager_name || p.display_name || p.first_name || 'Anonymous',
      firstName: p.first_name,
      displayName: p.display_name || p.manager_name || p.first_name || 'Anonymous',
      score: scoreByProfile.get(p.id) ?? 0,
      createdAt: p.created_at,
    })
  }
  for (const u of (legacyUsers ?? []) as LegacyUserRow[]) {
    all.push({
      userId: u.id,
      profileId: null,
      managerName: u.display_name || u.first_name || 'Anonymous',
      firstName: u.first_name,
      displayName: u.display_name || u.first_name || 'Anonymous',
      score: scoreByLegacy.get(u.id) ?? 0,
      createdAt: u.created_at,
    })
  }

  return { ranked: rankAndSort(all) }
}

/** score DESC, then created_at ASC, then rank assigned 1..N. */
export function rankAndSort(all: AggregatedRow[]): RankedRow[] {
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.createdAt.localeCompare(b.createdAt)
  })
  return all.map((r, i) => ({ ...r, rank: i + 1 }))
}

export function findMe(ranked: RankedRow[], meId: string): RankedRow | null {
  return ranked.find((r) => r.userId === meId || r.profileId === meId) ?? null
}

export const PUBLIC_LEADERBOARD_CACHE_CONTROL =
  'public, s-maxage=30, stale-while-revalidate=120'
