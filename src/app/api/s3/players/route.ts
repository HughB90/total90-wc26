import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * /api/s3/players
 *
 * Source of truth (post 2026-06-06 schema split + rename):
 *   - players              (identity, demographics, photo, wc26_group, wc26_active, wc26_participant, legacy_player_uuid)
 *   - player_intelligence  (T90, FIFA, vote counters)
 *
 * Frontend response shape is preserved 1:1 with the pre-split s3_players response.
 * Extra fields added: wc26_group, wc26_active.
 *
 * The `id` field returned to the frontend is the LEGACY s3_players UUID (legacy_player_uuid)
 * so the existing /api/s3/vote flow (which keys on UUID) keeps working without a client change.
 *
 * Voting pool filter: wc26_participant=true AND wc26_active=true (excludes deprecated
 * legacy-numeric-opta duplicates whose votes have been merged into the canonical row).
 *
 * NOTE on s3_value: stopped reading entirely 2026-06-06. Returned as null for back-compat.
 */

type PlayerJoinRow = {
  opta_id: string
  full_name: string
  short_name: string | null
  nationality: string | null
  position: string | null
  pos_short: string | null
  club: string | null
  age: number | null
  photo_url: string | null
  wc26_group: string | null
  wc26_active: boolean
  wc26_participant: boolean
  legacy_player_uuid: string | null
  player_intelligence: {
    t90_score: number | null
    cat_score: number | null
    tenk_score: number | null
    starting_xi: number | null
    t90_rank: number | null
    sign_count: number | null
    sell_count: number | null
    sack_count: number | null
    vote_count: number | null
  } | null
}

function shapeRow(r: PlayerJoinRow) {
  const intel = r.player_intelligence
  return {
    // back-compat: frontend + /api/s3/vote both expect `id` to be the UUID
    id: r.legacy_player_uuid,
    opta_id: r.opta_id,
    name: r.full_name,
    short_name: r.short_name,
    nationality: r.nationality,
    position: r.position,
    pos_short: r.pos_short,
    club: r.club,
    age: r.age,
    photo_url: r.photo_url,
    // s3_value is deprecated post-split; clients that still read it get null
    s3_value: null,
    market_value_eur: null,
    is_active: r.wc26_active,
    // intel
    t90_score: intel?.t90_score ?? null,
    cat_score: intel?.cat_score ?? null,
    tenk_score: intel?.tenk_score ?? null,
    starting_xi: intel?.starting_xi ?? null,
    t90_rank: intel?.t90_rank ?? null,
    sign_count: intel?.sign_count ?? 0,
    sell_count: intel?.sell_count ?? 0,
    sack_count: intel?.sack_count ?? 0,
    vote_count: intel?.vote_count ?? 0,
    // new fields (post-split)
    wc26_group: r.wc26_group,
    wc26_active: r.wc26_active,
    wc26_participant: r.wc26_participant,
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode')
    const exclude = url.searchParams.get('exclude')?.split(',').filter(Boolean) ?? []

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    if (mode === 'random') {
      let query = supabase
        .from('players')
        .select(
          'opta_id, full_name, short_name, nationality, position, pos_short, club, age, photo_url, wc26_group, wc26_active, wc26_participant, legacy_player_uuid, player_intelligence(t90_score, cat_score, tenk_score, starting_xi, t90_rank, sign_count, sell_count, sack_count, vote_count)',
        )
        .eq('wc26_active', true)
        .eq('wc26_participant', true)

      if (exclude.length > 0) {
        query = query.not('legacy_player_uuid', 'in', `(${exclude.join(',')})`)
      }

      const { data: rows, error } = (await query
        .order('t90_score', { ascending: false, nullsFirst: false, foreignTable: 'player_intelligence' })
        .limit(150)) as { data: PlayerJoinRow[] | null; error: { message: string } | null }

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!rows || rows.length === 0) return NextResponse.json([])

      const shuffled = rows.sort(() => Math.random() - 0.5)
      return NextResponse.json(shuffled.slice(0, 3).map(shapeRow))
    }

    // Default: leaderboard, T90 desc
    const { data: rows, error } = (await supabase
      .from('players')
      .select(
        'opta_id, full_name, short_name, nationality, position, pos_short, club, age, photo_url, wc26_group, wc26_active, wc26_participant, legacy_player_uuid, player_intelligence(t90_score, cat_score, tenk_score, starting_xi, t90_rank, sign_count, sell_count, sack_count, vote_count)',
      )
      .eq('wc26_active', true)
      .eq('wc26_participant', true)
      .order('t90_score', { ascending: false, nullsFirst: false, foreignTable: 'player_intelligence' })) as {
      data: PlayerJoinRow[] | null
      error: { message: string } | null
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json((rows ?? []).map(shapeRow))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
