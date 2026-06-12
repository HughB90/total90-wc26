/**
 * GET /api/fantasy/competitions
 * 
 * Returns available fantasy competitions with round breakdown.
 * 
 * Response:
 * [
 *   {
 *     code: 'WC2026',
 *     name: 'FIFA World Cup 2026',
 *     season: '2026',
 *     rounds: [
 *       { code: 'WC2026-MD1', name: 'Matchday 1', playedCount: 16, fixtureCount: 16 },
 *       ...
 *     ]
 *   }
 * ]
 */

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = createAdminSupabase()

    // Get active competitions
    const { data: comps, error: compError } = await supabase
      .from('fantasy_competitions')
      .select('id, code, name, season')
      .eq('active', true)
      .order('season', { ascending: false })

    if (compError) throw compError

    const result = []

    for (const comp of comps || []) {
      // Get round breakdown
      const { data: rounds, error: roundError } = await supabase
        .from('fantasy_fixtures')
        .select('round_code, round_name, status')
        .eq('competition_id', comp.id)

      if (roundError) throw roundError

      const roundMap = new Map<string, { code: string; name: string; playedCount: number; fixtureCount: number }>()
      
      for (const r of rounds || []) {
        if (!roundMap.has(r.round_code)) {
          roundMap.set(r.round_code, {
            code: r.round_code,
            name: r.round_name || r.round_code,
            playedCount: 0,
            fixtureCount: 0,
          })
        }
        const entry = roundMap.get(r.round_code)!
        entry.fixtureCount++
        if (r.status === 'played') entry.playedCount++
      }

      result.push({
        code: comp.code,
        name: comp.name,
        season: comp.season,
        rounds: Array.from(roundMap.values()),
      })
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('GET /api/fantasy/competitions error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
