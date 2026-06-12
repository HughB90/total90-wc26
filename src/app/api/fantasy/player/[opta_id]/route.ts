/**
 * GET /api/fantasy/player/[opta_id]
 * 
 * Returns per-match breakdown for a single player.
 * 
 * Response:
 * {
 *   player: { opta_player_id, name, team, position, pos_type },
 *   matches: [
 *     {
 *       date, opponent, result, mins, fantasy_points,
 *       breakdown: { goals: 7, assist: 5, ... },
 *       raw_stats: { goals: 1, goalAssist: 1, ... }
 *     }
 *   ]
 * }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ opta_id: string }> }
) {
  try {
    const { opta_id } = await params
    const url = new URL(req.url)
    const competition = url.searchParams.get('competition') || 'WC2026'

    const supabase = createAdminSupabase()

    // Get competition ID
    const { data: comp } = await supabase
      .from('fantasy_competitions')
      .select('id')
      .eq('code', competition)
      .single()

    if (!comp) {
      return NextResponse.json({ error: 'Competition not found' }, { status: 404 })
    }

    // Get player stats with fixture details
    const { data: stats, error: statsError } = await supabase
      .from('fantasy_player_match_stats')
      .select(`
        *,
        fixture:fantasy_fixtures(date, home_team, away_team, home_score, away_score, round_code, round_name)
      `)
      .eq('competition_id', comp.id)
      .eq('opta_player_id', opta_id)
      .order('fixture(date)', { ascending: true })

    if (statsError) throw statsError

    if (!stats || stats.length === 0) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const first = stats[0]
    const matches = stats.map(s => {
      const fx = s.fixture as any
      const isHome = s.team === fx?.home_team
      const opponent = isHome ? fx?.away_team : fx?.home_team
      const teamScore = isHome ? fx?.home_score : fx?.away_score
      const oppScore = isHome ? fx?.away_score : fx?.home_score
      const result = `${teamScore}-${oppScore}`

      return {
        date: fx?.date,
        round: fx?.round_name || fx?.round_code,
        opponent,
        result,
        mins: s.mins,
        fantasy_points: s.fantasy_points,
        breakdown: s.breakdown,
        raw_stats: s.raw_stats,
      }
    })

    const response = {
      player: {
        opta_player_id: first.opta_player_id,
        name: first.name,
        team: first.team,
        position: first.position,
        pos_type: first.pos_type,
      },
      matches,
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('GET /api/fantasy/player/[opta_id] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
