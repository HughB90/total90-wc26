/**
 * GET /api/predictor/leaderboard
 *
 * Query:
 *   - scope=global | league
 *   - league_id (required when scope=league)
 *   - limit (default 10, max 200)
 *
 * Returns: { rows: [{ rank, profile_id, manager_name, first_name, total }],
 *            my_row: { rank, total } | null }
 *
 * NOTE — Scoring engine (Wave D) is NOT shipped yet. All `total` values are
 * 0 and ranks are assigned by stable profile-id order. The UI must render
 * the 0s without breaking. When the engine ships, swap the score source to
 * `predictor_scores` aggregated per profile.
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'global'
  const leagueId = url.searchParams.get('league_id')
  const limitParam = parseInt(url.searchParams.get('limit') ?? '10', 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 200)
    : 10

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
    return NextResponse.json({ rows: [], my_row: null })
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

  const truncated = ranked.slice(0, limit)

  let myRow = null
  if (session) {
    const found = ranked.find((r) => r.profile_id === session.profile_id)
    if (found) myRow = { rank: found.rank, total: found.total }
  }

  return NextResponse.json({ rows: truncated, my_row: myRow, total_players: ranked.length })
}
