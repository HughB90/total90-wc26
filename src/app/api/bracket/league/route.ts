import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// `userId` from the client is the active *profile id* (post Pass 2+5 multi-profile).
// Bracket league tables FK `user_id` → auth.users and `creator_id` → auth.users,
// so we must resolve profile.id → profile.account_id (= auth.users.id) before writing.
// If the id passed in is NOT found in `profiles`, we assume it's already an auth.users
// id (legacy bracket_users path) and pass it through as both.
async function resolveAuthAndProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ authUserId: string; profileId: string | null }> {
  const { data: prof } = await (supabase
    .from('profiles')
    .select('id, account_id')
    .eq('id', userId)
    .maybeSingle() as any)
  if (prof && prof.account_id) {
    return { authUserId: prof.account_id as string, profileId: prof.id as string }
  }
  return { authUserId: userId, profileId: null }
}

export async function POST(request: Request) {
  try {
    const { userId, action, name, inviteCode, leagueId } = await request.json() as {
      userId: string
      action: 'create' | 'join' | 'leave' | 'rename' | 'delete'
      name?: string
      inviteCode?: string
      leagueId?: string
    }

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { authUserId, profileId } = await resolveAuthAndProfile(supabase, userId)

    // Delete league (creator only — removes all members + league)
    if (action === 'delete') {
      if (!leagueId) return NextResponse.json({ error: 'leagueId required' }, { status: 400 })
      // Verify creator (creator_id is an auth.users id)
      const { data: lg } = await (supabase.from('wc26_leagues').select('creator_id').eq('id', leagueId).maybeSingle() as any)
      if (!lg || lg.creator_id !== authUserId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      await (supabase.from('wc26_league_members').delete().eq('league_id', leagueId) as any)
      await (supabase.from('wc26_leagues').delete().eq('id', leagueId) as any)
      return NextResponse.json({ ok: true })
    }

    // Leave league — match by profile_id when available so a single auth user
    // (parent) with multiple kid profiles can leave on behalf of just one profile.
    if (action === 'leave') {
      if (!leagueId) return NextResponse.json({ error: 'leagueId required' }, { status: 400 })
      if (profileId) {
        await (supabase.from('wc26_league_members').delete().match({ league_id: leagueId, profile_id: profileId }) as any)
      } else {
        await (supabase.from('wc26_league_members').delete().match({ league_id: leagueId, user_id: authUserId }) as any)
      }
      return NextResponse.json({ ok: true })
    }

    // Rename league (creator only)
    if (action === 'rename') {
      if (!leagueId || !name) return NextResponse.json({ error: 'leagueId and name required' }, { status: 400 })
      const { error } = await (supabase.from('wc26_leagues').update({ name: name.trim() }).match({ id: leagueId, creator_id: authUserId }) as any)
      if (error) return NextResponse.json({ error: 'Not authorized or league not found' }, { status: 403 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'create') {
      if (!name) return NextResponse.json({ error: 'name required to create league' }, { status: 400 })

      // Generate unique code
      let code = randomCode()
      let attempts = 0
      while (attempts < 5) {
        const { data: existing } = await supabase
          .from('wc26_leagues')
          .select('id')
          .eq('invite_code', code)
          .single()
        if (!existing) break
        code = randomCode()
        attempts++
      }

      const { data: league, error } = await supabase
        .from('wc26_leagues')
        .insert({ name: name.trim(), invite_code: code, creator_id: authUserId })
        .select('id, invite_code, name')
        .single()

      if (error || !league) {
        return NextResponse.json({ error: error?.message ?? 'Failed to create league' }, { status: 500 })
      }

      // Add creator as member. Prefer profile_id (post Pass 2+5); fall back to
      // user_id for legacy bracket_users callers (no profile match).
      const memberRow: Record<string, unknown> = { league_id: league.id }
      if (profileId) memberRow.profile_id = profileId
      else memberRow.user_id = authUserId
      await (supabase.from('wc26_league_members').insert(memberRow) as any)

      return NextResponse.json({ ok: true, league })
    }

    if (action === 'join') {
      if (!inviteCode) return NextResponse.json({ error: 'inviteCode required to join' }, { status: 400 })

      const { data: league } = await supabase
        .from('wc26_leagues')
        .select('id, name, invite_code')
        .eq('invite_code', inviteCode.toUpperCase())
        .single()

      if (!league) {
        return NextResponse.json({ error: 'League not found' }, { status: 404 })
      }

      // Write profile_id (post Pass 2+5) so a parent can join the same league
      // once per kid profile. Legacy bracket_users callers fall back to user_id.
      const memberRow: Record<string, unknown> = { league_id: league.id }
      let onConflict: string
      if (profileId) {
        memberRow.profile_id = profileId
        onConflict = 'league_id,profile_id'
      } else {
        memberRow.user_id = authUserId
        onConflict = 'league_id,user_id'
      }
      const { error } = await (supabase
        .from('wc26_league_members')
        .upsert(memberRow, { onConflict }) as any)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, league })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Resolve profile.id → account_id so isCreator comparison works for either id type.
    const { authUserId, profileId } = await resolveAuthAndProfile(supabase, userId)

    // Get leagues this caller is in. When the caller is a profile (post Pass 2+5),
    // scope strictly to that profile so kid profiles only see their own leagues.
    // For legacy (no profile match) fall back to user_id = auth.users.id.
    const matchExpr = profileId
      ? `profile_id.eq.${profileId}`
      : `user_id.eq.${authUserId},profile_id.eq.${userId}`
    const { data: memberships } = await (supabase
      .from('wc26_league_members')
      .select('league_id, user_id, profile_id, wc26_leagues(id, name, invite_code, creator_id)')
      .or(matchExpr) as any)

    if (!memberships?.length) return NextResponse.json({ leagues: [] })

    // For each league get rank info
    const leagues = await Promise.all((memberships as any[]).map(async (m: any) => {
      const league = m.wc26_leagues
      if (!league) return null

      // Get all members' scores for this league
      const { data: leagueMembers } = await (supabase
        .from('wc26_league_members')
        .select('user_id')
        .eq('league_id', league.id) as any)

      // Collect both kinds of identifiers so we can match bracket_entries
      // regardless of which scheme the row uses.
      const memberUserIds = (leagueMembers as any[])?.map((lm: any) => lm.user_id).filter(Boolean) ?? []
      const memberProfileIds = (leagueMembers as any[])?.map((lm: any) => lm.profile_id).filter(Boolean) ?? []
      const memberIds = Array.from(new Set([...memberUserIds, ...memberProfileIds]))

      const { data: entries } = await (supabase
        .from('bracket_entries')
        .select('user_id, profile_id, score')
        .or(`user_id.in.(${memberIds.join(',')}),profile_id.in.(${memberIds.join(',')})`) as any)

      // Sum scores per member (key by user_id when present, else profile_id)
      const scoreMap = new Map<string, number>()
      for (const e of (entries ?? []) as any[]) {
        const key = e.user_id ?? e.profile_id
        if (!key) continue
        scoreMap.set(key, (scoreMap.get(key) ?? 0) + (e.score ?? 0))
      }

      const sorted = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1])
      const myRank = sorted.findIndex(([uid]) => uid === userId) + 1
      const myScore = scoreMap.get(userId) ?? 0

      return {
        id: league.id,
        name: league.name,
        inviteCode: league.invite_code,
        memberCount: memberUserIds.length || memberProfileIds.length,
        myRank: myRank || memberUserIds.length || memberProfileIds.length,
        myScore,
        isCreator: league.creator_id === userId || league.creator_id === authUserId,
      }
    }))

    return NextResponse.json({ leagues: leagues.filter(Boolean) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
