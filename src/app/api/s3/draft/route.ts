/**
 * GET /api/s3/draft
 *
 * Returns the current profile's draft picks as a player-keyed map.
 *
 * Response 200:
 *   { picks: { [player_id]: { drafted: boolean, my_team: boolean, favorite: boolean } } }
 * Response 401: { error: 'unauthenticated' }
 */

import { NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data, error } = await admin()
    .from('s3_draft_picks')
    .select('player_id, drafted, my_team, favorite')
    .eq('profile_id', session.profile_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const picks: Record<string, { drafted: boolean; my_team: boolean; favorite: boolean }> = {}
  for (const row of data ?? []) {
    picks[row.player_id] = {
      drafted: !!row.drafted,
      my_team: !!row.my_team,
      favorite: !!row.favorite,
    }
  }

  return NextResponse.json({ picks })
}
