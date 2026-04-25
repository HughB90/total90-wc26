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
      .select('s3_value, vote_count')
      .eq('id', playerId)
      .single()

    if (fetchErr || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // Update counts + T90
    const t90Delta = vote === 'sign' ? 10 : vote === 'sack' ? -10 : 0
    const updates: Record<string, number> = {
      s3_value: (player.s3_value || 1000) + t90Delta,
      vote_count: (player.vote_count || 0) + 1,
    }

    const { error: updateErr } = await supabase
      .from('s3_players')
      .update(updates)
      .eq('id', playerId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, newT90: updates.s3_value })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
