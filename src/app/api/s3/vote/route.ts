import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { playerId, vote, voterFingerprint } = await request.json()

    if (!playerId || !vote || !['sign', 'sell', 'sack'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Insert vote record
    const { error: insertErr } = await supabase
      .from('s3_votes')
      .insert({
        player_id: playerId,
        vote,
        voter_fingerprint: voterFingerprint || 'anon',
      })

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Fetch current player
    const { data: player, error: fetchErr } = await supabase
      .from('s3_players')
      .select('elo_score, sign_count, sell_count, sack_count')
      .eq('id', playerId)
      .single()

    if (fetchErr || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // Update counts + ELO
    const eloDelta = vote === 'sign' ? 10 : vote === 'sack' ? -10 : 0
    const updates: Record<string, number> = {
      elo_score: (player.elo_score || 1000) + eloDelta,
    }
    if (vote === 'sign') updates.sign_count = (player.sign_count || 0) + 1
    if (vote === 'sell') updates.sell_count = (player.sell_count || 0) + 1
    if (vote === 'sack') updates.sack_count = (player.sack_count || 0) + 1

    const { error: updateErr } = await supabase
      .from('s3_players')
      .update(updates)
      .eq('id', playerId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, newElo: updates.elo_score })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
