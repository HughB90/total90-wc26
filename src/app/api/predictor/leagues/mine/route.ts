/**
 * GET /api/predictor/leagues/mine
 *
 * Auth: requires a signed-in profile.
 *
 * Returns: { leagues: [{ id, name, invite_code, member_count, my_rank, is_admin }] }
 *
 * Ranks are computed against the (yet-to-ship) predictor scoring engine.
 * Until Wave D wires `predictor_scores` to be populated, all scores are 0
 * and `my_rank` falls back to the member ordering by join time.
 */

import { NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

interface MembershipRow {
  league_id: string
  is_admin: boolean
  wc26_predictor_leagues: {
    id: string
    name: string
    invite_code: string
    created_by: string
  } | null
}

export async function GET() {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ leagues: [] })

  const sb = predictorAdmin()

  const { data: memberships, error } = await sb
    .from('wc26_predictor_league_members')
    .select('league_id, is_admin, wc26_predictor_leagues(id, name, invite_code, created_by)')
    .eq('profile_id', session.profile_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!memberships?.length) return NextResponse.json({ leagues: [] })

  const rows = memberships as unknown as MembershipRow[]

  const leagueIds = rows.map((r) => r.league_id)

  // Member counts in one round-trip
  const { data: counts } = await sb
    .from('wc26_predictor_league_members')
    .select('league_id, profile_id')
    .in('league_id', leagueIds)

  const countByLeague = new Map<string, number>()
  for (const c of counts ?? []) {
    countByLeague.set(c.league_id, (countByLeague.get(c.league_id) ?? 0) + 1)
  }

  // Scoring engine not shipped yet — everyone's at 0, my_rank = 1.
  // We still surface the membership so the UI is wired end-to-end.
  const leagues = rows.map((r) => {
    const lg = r.wc26_predictor_leagues
    if (!lg) return null
    return {
      id: lg.id,
      name: lg.name,
      invite_code: lg.invite_code,
      member_count: countByLeague.get(r.league_id) ?? 1,
      my_rank: 1,
      is_admin: r.is_admin,
    }
  }).filter(Boolean)

  return NextResponse.json({ leagues })
}
