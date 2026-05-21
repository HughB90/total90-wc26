/**
 * POST /api/predictor/leagues/create
 *
 * Body: { name: string }
 * Auth: requires a signed-in profile (predictor session).
 * Side effects:
 *   - inserts row in `wc26_predictor_leagues` with a unique 6-char invite code
 *   - inserts the creator into `wc26_predictor_league_members` with is_admin=true
 *
 * Returns: { league_id, invite_code, name }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import { randomInviteCode } from '@/lib/predictor-leagues'

export const dynamic = 'force-dynamic'

const MAX_NAME_LEN = 80

export async function POST(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })
  if (name.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: 'name_too_long' }, { status: 400 })
  }

  const sb = predictorAdmin()

  // Generate a unique invite code (retry up to 5x on collision)
  let inviteCode = randomInviteCode()
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await sb
      .from('wc26_predictor_leagues')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle()
    if (!existing) break
    inviteCode = randomInviteCode()
  }

  const { data: league, error: lErr } = await sb
    .from('wc26_predictor_leagues')
    .insert({ name, invite_code: inviteCode, created_by: session.profile_id })
    .select('id, name, invite_code')
    .single()

  if (lErr || !league) {
    return NextResponse.json({ error: lErr?.message ?? 'create_failed' }, { status: 500 })
  }

  const { error: mErr } = await sb
    .from('wc26_predictor_league_members')
    .insert({ league_id: league.id, profile_id: session.profile_id, is_admin: true })

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 })
  }

  return NextResponse.json({
    league_id: league.id,
    invite_code: league.invite_code,
    name: league.name,
  })
}
