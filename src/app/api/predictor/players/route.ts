/**
 * GET /api/predictor/players?team_code=USA
 *
 * Returns the squad list for a national team — used by the Anytime Goalscorer
 * picker on R5–R8 round pages. Pulls from the canonical `s3_players` table
 * filtered by nationality (which already stores full country names matching
 * predictor_matches.home_team_code / away_team_code).
 *
 * Public endpoint. 60s edge cache since rosters don't churn mid-tournament.
 *
 * Response: { team_code, players: Array<{ id, name, short_name, last_name, position, photo_url }> }
 */

import { NextResponse } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const teamCode = url.searchParams.get('team_code')?.trim()
  if (!teamCode) {
    return NextResponse.json({ error: 'team_code_required' }, { status: 400 })
  }

  const sb = predictorAdmin()
  const { data, error } = await sb
    .from('s3_players')
    .select('id, name, short_name, last_name, position, photo_url')
    .eq('nationality', teamCode)
    .eq('is_active', true)
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { team_code: teamCode, players: data ?? [] },
    {
      headers: {
        // Public, modest cache; rosters change rarely during a tournament.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    }
  )
}
