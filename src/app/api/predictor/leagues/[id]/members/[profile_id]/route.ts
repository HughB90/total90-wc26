/**
 * DELETE /api/predictor/leagues/[id]/members/[profile_id]
 *
 * Kick a member from a predictor league.
 *
 * Rules:
 *   - Caller must be a league admin OR be the same profile (self-leave)
 *   - The league creator cannot be kicked (must delete the league instead)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; profile_id: string }> }
) {
  const { id, profile_id } = await ctx.params
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const sb = predictorAdmin()

  const { data: league } = await sb
    .from('wc26_predictor_leagues')
    .select('created_by')
    .eq('id', id)
    .maybeSingle()

  if (!league) return NextResponse.json({ error: 'league_not_found' }, { status: 404 })
  if (league.created_by === profile_id) {
    return NextResponse.json({ error: 'cannot_kick_creator' }, { status: 400 })
  }

  // Authorization: admin OR self-leave
  const { data: caller } = await sb
    .from('wc26_predictor_league_members')
    .select('is_admin')
    .eq('league_id', id)
    .eq('profile_id', session.profile_id)
    .maybeSingle()

  const isSelfLeave = session.profile_id === profile_id
  if (!isSelfLeave && !caller?.is_admin) {
    return NextResponse.json({ error: 'not_admin' }, { status: 403 })
  }

  const { error } = await sb
    .from('wc26_predictor_league_members')
    .delete()
    .match({ league_id: id, profile_id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
