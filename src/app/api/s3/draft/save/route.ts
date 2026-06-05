/**
 * POST /api/s3/draft/save
 *
 * Body: { picks: [{ player_id: uuid, drafted: bool, my_team: bool, favorite: bool }, ...] }
 *
 * Bulk upsert. Rows where all three booleans are false are deleted instead of
 * upserted (no need to store inactive picks).
 *
 * Response 200: { saved: number, deleted: number }
 * Response 400: { error: 'invalid_body' | 'pick_shape_invalid' }
 * Response 401: { error: 'unauthenticated' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const MAX_PICKS = 500 // top 250 × room for headroom

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface PickInput {
  player_id: string
  drafted: boolean
  my_team: boolean
  favorite: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const raw = (body && typeof body === 'object' && 'picks' in body)
    ? (body as { picks: unknown }).picks
    : null
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'picks_required' }, { status: 400 })
  }
  if (raw.length > MAX_PICKS) {
    return NextResponse.json({ error: 'too_many_picks', max: MAX_PICKS }, { status: 400 })
  }

  const toUpsert: PickInput[] = []
  const toDelete: string[] = []

  for (const p of raw) {
    if (!p || typeof p !== 'object') {
      return NextResponse.json({ error: 'pick_shape_invalid' }, { status: 400 })
    }
    const r = p as Record<string, unknown>
    const player_id = typeof r.player_id === 'string' ? r.player_id : ''
    if (!UUID_RE.test(player_id)) {
      return NextResponse.json({ error: 'pick_player_id_invalid' }, { status: 400 })
    }
    const drafted = !!r.drafted
    const my_team = !!r.my_team
    const favorite = !!r.favorite
    if (!drafted && !my_team && !favorite) {
      toDelete.push(player_id)
    } else {
      toUpsert.push({ player_id, drafted, my_team, favorite })
    }
  }

  const supabase = admin()
  let saved = 0
  let deleted = 0

  if (toUpsert.length) {
    const rows = toUpsert.map(p => ({
      profile_id: session.profile_id,
      player_id: p.player_id,
      drafted: p.drafted,
      my_team: p.my_team,
      favorite: p.favorite,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('s3_draft_picks')
      .upsert(rows, { onConflict: 'profile_id,player_id' })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    saved = rows.length
  }

  if (toDelete.length) {
    const { error } = await supabase
      .from('s3_draft_picks')
      .delete()
      .eq('profile_id', session.profile_id)
      .in('player_id', toDelete)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    deleted = toDelete.length
  }

  return NextResponse.json({ saved, deleted })
}
