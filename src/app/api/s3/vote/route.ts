import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * /api/s3/vote
 *
 * POST { votes: [{ playerId, vote: 'sign'|'sell'|'sack' }] }
 *
 * `playerId` is the LEGACY s3_players.id UUID (back-compat — the players API returns
 * legacy_player_uuid as `id`). Post 2026-06-06 schema split we look up the canonical
 * opta_id via t90_players.legacy_player_uuid and write counters to t90_player_intelligence.
 */

// Simple in-memory rate limiter
const voteRateLimit = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 100
const WINDOW_MS = 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    const now = Date.now()
    const entry = voteRateLimit.get(ip)
    if (entry && now < entry.resetAt) {
      if (entry.count >= RATE_LIMIT) {
        return NextResponse.json({ error: 'Too many votes. Try again later.' }, { status: 429 })
      }
      entry.count++
    } else {
      voteRateLimit.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    }

    const { votes } = await request.json()
    if (!Array.isArray(votes) || votes.length === 0) {
      return NextResponse.json({ error: 'Invalid payload: votes array required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    for (const { playerId, vote } of votes) {
      if (!playerId || !vote || !['sign', 'sell', 'sack'].includes(vote)) continue

      // Look up the canonical opta_id via legacy UUID
      const { data: player } = (await supabase
        .from('t90_players')
        .select('opta_id, wc26_active, t90_player_intelligence(vote_count, sign_count, sell_count, sack_count)')
        .eq('legacy_player_uuid', playerId)
        .eq('wc26_active', true)
        .single()) as {
        data: {
          opta_id: string
          wc26_active: boolean
          t90_player_intelligence: {
            vote_count: number | null
            sign_count: number | null
            sell_count: number | null
            sack_count: number | null
          } | null
        } | null
      }

      if (!player) continue
      const intel = player.t90_player_intelligence
      const updates = {
        vote_count: (intel?.vote_count || 0) + 1,
        sign_count: (intel?.sign_count || 0) + (vote === 'sign' ? 1 : 0),
        sell_count: (intel?.sell_count || 0) + (vote === 'sell' ? 1 : 0),
        sack_count: (intel?.sack_count || 0) + (vote === 'sack' ? 1 : 0),
        updated_at: new Date().toISOString(),
      }
      await supabase.from('t90_player_intelligence').update(updates).eq('opta_id', player.opta_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
