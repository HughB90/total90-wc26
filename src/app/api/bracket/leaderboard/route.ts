import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const leagueCode = searchParams.get('leagueCode')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (leagueCode) {
      // Get league members first
      const { data: league } = await supabase
        .from('bracket_leagues')
        .select('id')
        .eq('invite_code', leagueCode.toUpperCase())
        .single()

      if (!league) {
        return NextResponse.json({ error: 'League not found' }, { status: 404 })
      }

      const { data: members } = await supabase
        .from('bracket_league_members')
        .select('user_id')
        .eq('league_id', league.id)

      const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)

      if (memberIds.length === 0) {
        return NextResponse.json({ ok: true, rows: [] })
      }

      // Get entries for these members
      const { data: entries, error } = await supabase
        .from('bracket_entries')
        .select('user_id, score, bracket_users(display_name)')
        .in('user_id', memberIds)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const rows = aggregateScores(entries ?? [])
      return NextResponse.json({ ok: true, rows })
    }

    // Global leaderboard — top 50
    const { data: entries, error } = await supabase
      .from('bracket_entries')
      .select('user_id, score, bracket_users(display_name)')
      .order('score', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = aggregateScores(entries ?? []).slice(0, 50)
    return NextResponse.json({ ok: true, rows })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type RawEntry = {
  user_id: string
  score: number
  bracket_users: { display_name: string } | { display_name: string }[] | null
}

function aggregateScores(entries: RawEntry[]) {
  const map = new Map<string, { displayName: string; total: number }>()

  for (const entry of entries) {
    const displayName =
      Array.isArray(entry.bracket_users)
        ? entry.bracket_users[0]?.display_name ?? 'Unknown'
        : (entry.bracket_users as { display_name: string } | null)?.display_name ?? 'Unknown'

    const existing = map.get(entry.user_id)
    if (existing) {
      existing.total += entry.score ?? 0
    } else {
      map.set(entry.user_id, { displayName, total: entry.score ?? 0 })
    }
  }

  return Array.from(map.entries())
    .map(([userId, { displayName, total }]) => ({ userId, displayName, score: total }))
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ rank: i + 1, ...row }))
}
