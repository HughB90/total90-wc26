import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
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

    // Delete league (creator only — removes all members + league)
    if (action === 'delete') {
      if (!leagueId) return NextResponse.json({ error: 'leagueId required' }, { status: 400 })
      // Verify creator
      const { data: lg } = await (supabase.from('bracket_leagues').select('creator_id').eq('id', leagueId).maybeSingle() as any)
      if (!lg || lg.creator_id !== userId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      await (supabase.from('bracket_league_members').delete().eq('league_id', leagueId) as any)
      await (supabase.from('bracket_leagues').delete().eq('id', leagueId) as any)
      return NextResponse.json({ ok: true })
    }

    // Leave league
    if (action === 'leave') {
      if (!leagueId) return NextResponse.json({ error: 'leagueId required' }, { status: 400 })
      await (supabase.from('bracket_league_members').delete().match({ league_id: leagueId, user_id: userId }) as any)
      return NextResponse.json({ ok: true })
    }

    // Rename league (creator only)
    if (action === 'rename') {
      if (!leagueId || !name) return NextResponse.json({ error: 'leagueId and name required' }, { status: 400 })
      const { error } = await (supabase.from('bracket_leagues').update({ name: name.trim() }).match({ id: leagueId, creator_id: userId }) as any)
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
          .from('bracket_leagues')
          .select('id')
          .eq('invite_code', code)
          .single()
        if (!existing) break
        code = randomCode()
        attempts++
      }

      const { data: league, error } = await supabase
        .from('bracket_leagues')
        .insert({ name: name.trim(), invite_code: code, creator_id: userId })
        .select('id, invite_code, name')
        .single()

      if (error || !league) {
        return NextResponse.json({ error: error?.message ?? 'Failed to create league' }, { status: 500 })
      }

      // Add creator as member
      await supabase
        .from('bracket_league_members')
        .insert({ league_id: league.id, user_id: userId })

      return NextResponse.json({ ok: true, league })
    }

    if (action === 'join') {
      if (!inviteCode) return NextResponse.json({ error: 'inviteCode required to join' }, { status: 400 })

      const { data: league } = await supabase
        .from('bracket_leagues')
        .select('id, name, invite_code')
        .eq('invite_code', inviteCode.toUpperCase())
        .single()

      if (!league) {
        return NextResponse.json({ error: 'League not found' }, { status: 404 })
      }

      const { error } = await supabase
        .from('bracket_league_members')
        .upsert({ league_id: league.id, user_id: userId }, { onConflict: 'league_id,user_id' })

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

    // Get leagues user is in
    const { data: memberships } = await (supabase
      .from('bracket_league_members')
      .select('league_id, bracket_leagues(id, name, invite_code, creator_id)')
      .eq('user_id', userId) as any)

    if (!memberships?.length) return NextResponse.json({ leagues: [] })

    // For each league get rank info
    const leagues = await Promise.all((memberships as any[]).map(async (m: any) => {
      const league = m.bracket_leagues
      if (!league) return null

      // Get all members' scores for this league
      const { data: leagueMembers } = await (supabase
        .from('bracket_league_members')
        .select('user_id')
        .eq('league_id', league.id) as any)

      const memberIds = (leagueMembers as any[])?.map((lm: any) => lm.user_id) ?? []

      const { data: entries } = await (supabase
        .from('bracket_entries')
        .select('user_id, score')
        .in('user_id', memberIds) as any)

      // Sum scores per user
      const scoreMap = new Map<string, number>()
      for (const e of entries ?? []) {
        scoreMap.set(e.user_id, (scoreMap.get(e.user_id) ?? 0) + (e.score ?? 0))
      }

      const sorted = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1])
      const myRank = sorted.findIndex(([uid]) => uid === userId) + 1
      const myScore = scoreMap.get(userId) ?? 0

      return {
        id: league.id,
        name: league.name,
        inviteCode: league.invite_code,
        memberCount: memberIds.length,
        myRank: myRank || memberIds.length,
        myScore,
        isCreator: league.creator_id === userId,
      }
    }))

    return NextResponse.json({ leagues: leagues.filter(Boolean) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
