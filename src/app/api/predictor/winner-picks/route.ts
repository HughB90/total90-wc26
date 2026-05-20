/**
 * GET /api/predictor/winner-picks
 *
 * Public-after-lock aggregate of every profile's pre-tournament winner pick.
 * Returns 403 before lock; { picks: [{ team_code, count }] } sorted desc after.
 */

import { NextResponse } from 'next/server'
import { isWinnerPickLocked } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isWinnerPickLocked()) {
    return NextResponse.json({ error: 'locked_until_first_kickoff' }, { status: 403 })
  }

  const sb = predictorAdmin()
  const { data, error } = await sb
    .from('predictor_winner_picks')
    .select('team_code')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = new Map<string, number>()
  for (const row of data || []) {
    counts.set(row.team_code, (counts.get(row.team_code) || 0) + 1)
  }
  const picks = Array.from(counts.entries())
    .map(([team_code, count]) => ({ team_code, count }))
    .sort((a, b) => b.count - a.count || a.team_code.localeCompare(b.team_code))

  return NextResponse.json({ picks })
}
