import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode')
    const exclude = url.searchParams.get('exclude')?.split(',').filter(Boolean) ?? []

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (mode === 'random') {
      let query = supabase
        .from('s3_players')
        .select('id, name, short_name, nationality, position, s3_value, age, photo_url, sign_count, sell_count, sack_count, vote_count')
        .eq('is_active', true)

      if (exclude.length > 0) {
        query = query.not('id', 'in', `(${exclude.join(',')})`)
      }

      const { data: allPlayers, error } = await query.order('s3_value', { ascending: false }).limit(150) as any
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!allPlayers || allPlayers.length === 0) return NextResponse.json([])

      const shuffled = allPlayers.sort(() => Math.random() - 0.5)
      return NextResponse.json(shuffled.slice(0, 3))
    }

    // Default: return leaderboard
    const { data, error } = await supabase
      .from('s3_players')
      .select('id, name, short_name, nationality, position, s3_value, age, photo_url, is_active')
      .order('s3_value', { ascending: false }) as any

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
