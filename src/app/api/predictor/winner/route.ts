/**
 * POST /api/predictor/winner   — submit/update pre-tournament winner pick
 * GET  /api/predictor/winner   — current profile's pick (or null)
 *
 * Lock: 2026-06-11T19:00:00.000Z (R1 first kickoff).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession, isWinnerPickLocked } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ pick: null }, { status: 200 })

  const sb = predictorAdmin()
  const { data, error } = await sb
    .from('predictor_winner_picks')
    .select('team_code, submitted_at, updated_at')
    .eq('profile_id', session.profile_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pick: data ?? null })
}

export async function POST(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (isWinnerPickLocked()) {
    return NextResponse.json({ error: 'winner_pick_locked' }, { status: 403 })
  }

  let body: { team_code?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const teamCode = typeof body.team_code === 'string' ? body.team_code.trim() : ''
  if (!teamCode) {
    return NextResponse.json({ error: 'team_code_required' }, { status: 400 })
  }

  const sb = predictorAdmin()
  const { data, error } = await sb
    .from('predictor_winner_picks')
    .upsert(
      { profile_id: session.profile_id, team_code: teamCode },
      { onConflict: 'profile_id' }
    )
    .select('team_code, submitted_at, updated_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pick: data })
}
