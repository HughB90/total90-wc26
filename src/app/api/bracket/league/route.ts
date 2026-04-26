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
    const { userId, action, name, inviteCode } = await request.json() as {
      userId: string
      action: 'create' | 'join'
      name?: string
      inviteCode?: string
    }

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

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
