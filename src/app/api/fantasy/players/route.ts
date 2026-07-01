/**
 * GET /api/fantasy/players
 *
 * Query params:
 *   - competition (default: WC2026)
 *   - round (default: ALL → aggregate; or specific round_code like 'WC2026-MD1')
 *   - position (ALL | GKP | DEF | MID | FOR)
 *   - nation (optional team name filter)
 *   - sort (default: fantasy_points:desc)
 *   - limit (default 100, max 500)
 *   - search (name prefix match)
 *
 * Aggregation policy (Hugh mandate 2026-07-01):
 *   Sums live in Postgres. This route is a thin projection over the
 *   fantasy_player_totals / fantasy_player_round_totals views.
 *   No JS-side reduce loops over match rows. No pagination bugs.
 *
 *   If you ever find yourself reduce()-ing match_stats rows here again,
 *   stop and fix the view instead. See:
 *   supabase/migrations/2026-07-01-fantasy-player-totals-view.sql
 */

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type PosType = 'GKP' | 'DEF' | 'MID' | 'FOR'

interface AggregatedPlayer {
  opta_player_id: string
  name: string
  first_name: string | null
  last_name: string | null
  team: string
  position: string
  pos_type: PosType
  games_played: number
  mins_total: number
  fantasy_points_total: number
  fantasy_points_avg: number
  fantasy_points_per_90: number
  attacking: {
    goals: number
    assists: number
    sot: number
    sh: number
    kp: number
    bc: number
  }
  defensive: {
    tackles: number
    interceptions: number
    blocks: number
    clean_sheets: number
  }
  discipline: {
    yc: number
    rc: number
    og: number
    off: number
  }
  passing: {
    pass_acc: number
    acc_long: number
    ppa: number
    ft3: number
  }
  playmaker: {
    kp: number
    bc: number
    through_balls: number
    touches_in_box: number
    winning_goals: number
  }
  possession: {
    recoveries: number
    duels_won: number
    dispossessed: number
    poss_lost: number
  }
  gk?: {
    saves: number
    high_claims: number
    pen_saves: number
  }
}

// Numeric fields in the view come back as string (Postgres numeric).
// Coerce them once at the edge.
const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

function toPlayer(row: Record<string, unknown>): AggregatedPlayer {
  const p: AggregatedPlayer = {
    opta_player_id: String(row.opta_player_id),
    name: String(row.name ?? ''),
    first_name: (row.first_name as string) ?? null,
    last_name: (row.last_name as string) ?? null,
    team: String(row.team ?? ''),
    position: String(row.position ?? ''),
    pos_type: (row.pos_type as PosType) ?? 'MID',
    games_played: num(row.games_played),
    mins_total: num(row.mins_total),
    fantasy_points_total: num(row.fantasy_points_total),
    fantasy_points_avg: num(row.fantasy_points_avg),
    fantasy_points_per_90: num(row.fantasy_points_per_90),
    attacking: {
      goals: num(row.goals),
      assists: num(row.assists),
      sot: num(row.sot),
      sh: num(row.sh),
      kp: num(row.kp),
      bc: num(row.bc),
    },
    defensive: {
      tackles: num(row.tackles),
      interceptions: num(row.interceptions),
      blocks: num(row.blocks),
      clean_sheets: num(row.clean_sheets),
    },
    discipline: {
      yc: num(row.yc),
      rc: num(row.rc),
      og: num(row.og),
      off: num(row.off_),
    },
    passing: {
      pass_acc: num(row.pass_acc),
      acc_long: num(row.acc_long),
      ppa: num(row.ppa),
      ft3: num(row.ft3),
    },
    playmaker: {
      kp: num(row.kp),
      bc: num(row.bc),
      through_balls: num(row.through_balls),
      touches_in_box: num(row.touches_in_box),
      winning_goals: num(row.winning_goals),
    },
    possession: {
      recoveries: num(row.recoveries),
      duels_won: num(row.duels_won),
      dispossessed: num(row.dispossessed),
      poss_lost: num(row.poss_lost),
    },
  }

  if (p.pos_type === 'GKP') {
    p.gk = {
      saves: num(row.saves),
      high_claims: num(row.high_claims),
      pen_saves: num(row.pen_saves),
    }
  }

  return p
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const competition = url.searchParams.get('competition') || 'WC2026'
    const round = url.searchParams.get('round') || 'ALL'
    const position = url.searchParams.get('position') || 'ALL'
    const nation = url.searchParams.get('nation')
    const search = url.searchParams.get('search')
    const sort = url.searchParams.get('sort') || 'fantasy_points:desc'
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)

    const supabase = createAdminSupabase()

    const { data: comp } = await supabase
      .from('fantasy_competitions')
      .select('id')
      .eq('code', competition)
      .single()

    if (!comp) {
      return NextResponse.json({ error: 'Competition not found' }, { status: 404 })
    }

    // Route: ALL rounds → totals view; specific round → round-scoped view.
    // Both views own the aggregation math in Postgres.
    const viewName =
      round === 'ALL' ? 'fantasy_player_totals' : 'fantasy_player_round_totals'

    let q = supabase.from(viewName).select('*').eq('competition_id', comp.id)

    if (round !== 'ALL') {
      q = q.eq('round_code', round)
    }
    if (position !== 'ALL') {
      q = q.eq('pos_type', position)
    }
    if (nation) {
      q = q.eq('team', nation)
    }
    if (search) {
      q = q.ilike('name', `${search}%`)
    }

    // Push sort + limit into Postgres so we don't have to page.
    // Per-90 needs a floor of 25 minutes to filter out late-sub noise; we
    // still fetch all rows and filter/sort in JS because Supabase's
    // .order() can't express the conditional per-90 comparator. Row
    // count here is bounded (~1k players max at 2.5k match rows).
    const [sortField, sortDir] = sort.split(':')

    if (sortField === 'fantasy_points') {
      q = q.order('fantasy_points_total', { ascending: sortDir !== 'desc' })
    } else if (sortField === 'name') {
      q = q.order('name', { ascending: sortDir !== 'desc' })
    } else {
      // Fetch enough to let JS sort by per-90 with the 25-min floor.
      q = q.order('fantasy_points_total', { ascending: false })
    }

    // Safe upper bound: at most ~50 players × 48 nations. 5000 covers
    // any plausible dataset without hitting Supabase's 1000-row default.
    const { data: rows, error } = await q.range(0, 4999)
    if (error) throw error

    let players = (rows ?? []).map(toPlayer)

    if (sortField === 'fantasy_points_per_90' || sortField === 'pts_per_90') {
      players.sort((a, b) => {
        const av = a.mins_total >= 25 ? a.fantasy_points_per_90 : -1
        const bv = b.mins_total >= 25 ? b.fantasy_points_per_90 : -1
        return sortDir === 'desc' ? bv - av : av - bv
      })
    }

    const result = players.slice(0, limit)

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    console.error('GET /api/fantasy/players error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
