import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Leaderboard rows now include manager_name + first_name from the linked
 * profile (Pass 2+5). Falls back to legacy bracket_users.display_name for
 * any row that hasn't been backfilled yet.
 */

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

      const { data: entries, error } = await supabase
        .from('bracket_entries')
        .select('user_id, profile_id, score, bracket_users(display_name)')
        .in('user_id', memberIds)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const rows = await aggregateScores(supabase, entries ?? [])
      return NextResponse.json({ ok: true, rows, total: rows.length })
    }

    const { data: entries, error } = await supabase
      .from('bracket_entries')
      .select('user_id, profile_id, score, bracket_users(display_name)')
      .order('score', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = (await aggregateScores(supabase, entries ?? [])).slice(0, 50)
    return NextResponse.json({ ok: true, rows, total: rows.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type RawEntry = {
  user_id: string
  profile_id: string | null
  score: number
  bracket_users: { display_name: string } | { display_name: string }[] | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aggregateScores(supabase: any, entries: RawEntry[]) {
  // Aggregate raw rows per user
  const map = new Map<
    string,
    { displayName: string; total: number; profileId: string | null }
  >()

  for (const entry of entries) {
    const displayName =
      Array.isArray(entry.bracket_users)
        ? entry.bracket_users[0]?.display_name ?? 'Unknown'
        : (entry.bracket_users as { display_name: string } | null)?.display_name ?? 'Unknown'

    const existing = map.get(entry.user_id)
    if (existing) {
      existing.total += entry.score ?? 0
      if (!existing.profileId && entry.profile_id) existing.profileId = entry.profile_id
    } else {
      map.set(entry.user_id, {
        displayName,
        total: entry.score ?? 0,
        profileId: entry.profile_id,
      })
    }
  }

  // Look up profile manager_name + first_name in one shot
  const profileIds = Array.from(map.values())
    .map(v => v.profileId)
    .filter((x): x is string => !!x)

  let profileById = new Map<
    string,
    { manager_name: string | null; first_name: string | null; display_name: string | null }
  >()
  if (profileIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, manager_name, first_name, display_name')
      .in('id', profileIds)
    profileById = new Map(
      ((profs ?? []) as Array<{
        id: string
        manager_name: string | null
        first_name: string | null
        display_name: string | null
      }>).map(p => [p.id, p])
    )
  }

  return Array.from(map.entries())
    .map(([userId, { displayName, total, profileId }]) => {
      const prof = profileId ? profileById.get(profileId) : null
      return {
        userId,
        profileId,
        displayName: prof?.display_name || displayName,
        managerName: prof?.manager_name || displayName,
        firstName: prof?.first_name || null,
        score: total,
      }
    })
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ rank: i + 1, ...row }))
}
