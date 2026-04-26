import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { votes } = await request.json()
    // votes = [{ playerId, vote: 'sign'|'sell'|'sack' }]

    if (!Array.isArray(votes) || votes.length === 0) {
      return NextResponse.json({ error: 'Invalid payload: votes array required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    for (const { playerId, vote } of votes) {
      if (!playerId || !vote || !['sign', 'sell', 'sack'].includes(vote)) continue

      const { data: player } = await supabase
        .from('s3_players')
        .select('s3_value, sign_count, sell_count, sack_count, vote_count')
        .eq('id', playerId)
        .single() as any

      if (!player) continue

      const updates = {
                vote_count: (player.vote_count || 0) + 1,
        sign_count: (player.sign_count || 0) + (vote === 'sign' ? 1 : 0),
        sell_count: (player.sell_count || 0) + (vote === 'sell' ? 1 : 0),
        sack_count: (player.sack_count || 0) + (vote === 'sack' ? 1 : 0),
      }

      await supabase.from('s3_players').update(updates).eq('id', playerId) as any
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
