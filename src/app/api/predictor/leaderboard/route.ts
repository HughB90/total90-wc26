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
 * NOTE — Scoring engine (Wave D) is NOT shipped yet. All `total` values
 * are 0 and ranks are assigned by stable manager_name order. The UI
 * must render the 0s without breaking. When the engine ships, swap the
 * score source to `predictor_scores` aggregated per profile.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

interface ProfileRow {
  id: string
  manager_name: string | null
  first_name: string | null
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
    // Until scoring is wired, this gives us a real list (vs. dumping every profile
    // in the system).
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

  const { data: profiles, error: pErr } = await sb
    .from('profiles')
    .select('id, manager_name, first_name')
    .in('id', profileIds)

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const ranked = (profiles ?? [])
    .map((p: ProfileRow) => ({
      profile_id: p.id,
      manager_name: p.manager_name ?? p.first_name ?? 'Manager',
      first_name: p.first_name ?? '',
      total: 0, // TODO Wave D: aggregate predictor_scores.total_pts here
    }))
    // Stable ordering by manager_name so the zero-tie list is deterministic
    .sort((a, b) => a.manager_name.localeCompare(b.manager_name))
    .map((r, i) => ({ rank: i + 1, ...r }))

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
