/**
 * GET /api/leagues/:code/admin
 *
 * Returns the full member list with parent emails + points for the league
 * commissioner. Creator-only.
 *
 * Response:
 *   {
 *     league: { id, name, invite_code, code_changes_used, code_changes_remaining, is_creator: true },
 *     members: [{
 *       profile_id, user_id, account_email, first_name, manager_name,
 *       joined_at, total_pts
 *     }]
 *   }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'
import { resolveSession } from '@/lib/auth-session-server'

export const dynamic = 'force-dynamic'

const CODE_CHANGE_CAP = 3

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params
  if (!code) return NextResponse.json({ error: 'code_required' }, { status: 400 })

  const { account } = await resolveSession()
  if (!account) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const sb = createAdminSupabase()

  // Find league by current code OR by historical (non-expired) code
  let { data: league } = await sb
    .from('wc26_leagues')
    .select('id, name, invite_code, creator_id, code_changes_used')
    .eq('invite_code', code.toUpperCase())
    .maybeSingle()

  if (!league) {
    const { data: hist } = await sb
      .from('wc26_league_code_history')
      .select('league_id, expires_at')
      .eq('old_code', code.toUpperCase())
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (hist) {
      const r = await sb
        .from('wc26_leagues')
        .select('id, name, invite_code, creator_id, code_changes_used')
        .eq('id', hist.league_id)
        .maybeSingle()
      league = r.data ?? null
    }
  }

  if (!league) return NextResponse.json({ error: 'league_not_found' }, { status: 404 })
  if (league.creator_id !== account.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: members } = await sb
    .from('wc26_league_members')
    .select('league_id, profile_id, user_id, joined_at')
    .eq('league_id', league.id)

  const profileIds = (members ?? []).map((m: { profile_id: string | null }) => m.profile_id).filter(Boolean) as string[]
  const profilesById = new Map<string, { first_name: string; manager_name: string; account_id: string }>()
  if (profileIds.length) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, first_name, manager_name, account_id')
      .in('id', profileIds)
    for (const p of (profiles ?? []) as Array<{ id: string; first_name: string; manager_name: string; account_id: string }>) {
      profilesById.set(p.id, { first_name: p.first_name, manager_name: p.manager_name, account_id: p.account_id })
    }
  }

  // Pull parent emails (auth.users) for the distinct account_ids
  const accountIds = Array.from(new Set(
    Array.from(profilesById.values()).map((p) => p.account_id).filter(Boolean)
  ))
  const emailByAccount = new Map<string, string>()
  for (const aid of accountIds) {
    try {
      const r = await sb.auth.admin.getUserById(aid)
      if (r.data?.user?.email) emailByAccount.set(aid, r.data.user.email)
    } catch { /* skip */ }
  }

  // Pull points cache
  const pointsByProfile = new Map<string, number>()
  if (profileIds.length) {
    const { data: cache } = await sb
      .from('predictor_leaderboard_cache')
      .select('profile_id, total_pts')
      .in('profile_id', profileIds)
    for (const c of (cache ?? []) as Array<{ profile_id: string; total_pts: number }>) {
      pointsByProfile.set(c.profile_id, c.total_pts)
    }
  }

  const out = (members ?? []).map((m: { profile_id: string | null; user_id: string | null; joined_at: string | null }) => {
    const profile = m.profile_id ? profilesById.get(m.profile_id) : null
    return {
      profile_id: m.profile_id,
      user_id: m.user_id,
      account_email: profile ? (emailByAccount.get(profile.account_id) ?? null) : null,
      first_name: profile?.first_name ?? null,
      manager_name: profile?.manager_name ?? null,
      joined_at: m.joined_at,
      total_pts: m.profile_id ? (pointsByProfile.get(m.profile_id) ?? 0) : 0,
    }
  })

  return NextResponse.json({
    league: {
      id: league.id,
      name: league.name,
      invite_code: league.invite_code,
      code_changes_used: league.code_changes_used ?? 0,
      code_changes_remaining: Math.max(0, CODE_CHANGE_CAP - (league.code_changes_used ?? 0)),
      code_change_cap: CODE_CHANGE_CAP,
      is_creator: true,
    },
    members: out,
  })
}
