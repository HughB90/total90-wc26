/**
 * POST /api/predictor/leagues/join
 *
 * Body: { invite_code: string }
 * Auth: requires a signed-in profile.
 *
 * Returns: { league_id, name, invite_code, already_member?: true }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { invite_code?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const inviteCode = typeof body.invite_code === 'string'
    ? body.invite_code.trim().toUpperCase()
    : ''
  if (!inviteCode) return NextResponse.json({ error: 'invite_code_required' }, { status: 400 })

  const sb = predictorAdmin()

  const { data: league } = await sb
    .from('wc26_predictor_leagues')
    .select('id, name, invite_code')
    .eq('invite_code', inviteCode)
    .maybeSingle()

  if (!league) return NextResponse.json({ error: 'league_not_found' }, { status: 404 })

  // Already a member?
  const { data: existing } = await sb
    .from('wc26_predictor_league_members')
    .select('league_id')
    .eq('league_id', league.id)
    .eq('profile_id', session.profile_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      league_id: league.id,
      name: league.name,
      invite_code: league.invite_code,
      already_member: true,
    })
  }

  const { error: insErr } = await sb
    .from('wc26_predictor_league_members')
    .insert({ league_id: league.id, profile_id: session.profile_id, is_admin: false })

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({
    league_id: league.id,
    name: league.name,
    invite_code: league.invite_code,
  })
}
