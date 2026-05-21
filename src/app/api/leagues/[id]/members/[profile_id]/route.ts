/**
 * DELETE /api/leagues/:id/members/:profile_id
 *
 * Kick a member from a league. Creator-only. Creator cannot be removed.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'
import { resolveSession } from '@/lib/auth-session-server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; profile_id: string }> }
) {
  const { id, profile_id } = await ctx.params
  if (!id || !profile_id) {
    return NextResponse.json({ error: 'league_id_and_profile_id_required' }, { status: 400 })
  }

  const { account } = await resolveSession()
  if (!account) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const sb = createAdminSupabase()
  const { data: league } = await sb
    .from('wc26_leagues')
    .select('id, creator_id')
    .eq('id', id)
    .maybeSingle()
  if (!league) return NextResponse.json({ error: 'league_not_found' }, { status: 404 })
  if (league.creator_id !== account.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Don't allow the creator to remove themselves via this endpoint.
  // (Creator account_id != profile_id in general; we look up both.)
  const { data: targetProfile } = await sb
    .from('profiles')
    .select('id, account_id')
    .eq('id', profile_id)
    .maybeSingle()
  if (targetProfile && targetProfile.account_id === league.creator_id) {
    return NextResponse.json({ error: 'cannot_remove_creator' }, { status: 400 })
  }

  // Member rows may match on either profile_id (new) or user_id (legacy bracket).
  // Delete by profile_id first; also fall back to user_id (some legacy rows
  // stored bracket_users.id there).
  const delByProfile = await sb
    .from('wc26_league_members')
    .delete()
    .eq('league_id', id)
    .eq('profile_id', profile_id)
    .select('league_id')
  let deleted = delByProfile.data?.length ?? 0

  if (deleted === 0) {
    const delByUser = await sb
      .from('wc26_league_members')
      .delete()
      .eq('league_id', id)
      .eq('user_id', profile_id)
      .select('league_id')
    deleted += delByUser.data?.length ?? 0
  }

  return NextResponse.json({ ok: true, deleted })
}
