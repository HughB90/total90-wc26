/**
 * GET /api/fantasy/players
 *
 * Query params:
 *   - competition (default: WC2026)
 *   - round (default: ALL → aggregate; or specific round_code like 'WC2026-MD1')
 *   - position (ALL | GK | DEF | MID | FWD)
 *   - nation (optional team name filter)
 *   - sort (default: fantasy_points:desc)
 *       Also supports:
 *         - fantasy_points_per_90:desc
 *         - name:asc
 *         - category:<cat>:desc      → sort by category_points.<cat>
 *         - category_per90:<cat>:desc → sort by category_points.<cat> * 90 / mins
 *   - limit (default 100, max 500)
 *   - search (name prefix match)
 *
 * Returns aggregated player stats when round=ALL, per-round otherwise.
 *
 * Fill-in-zeros behavior (added 2026-06-30):
 *   When round != 'ALL', players who have ≥1 stat row anywhere in the
 *   competition but no rows in the selected round are returned with all-zero
 *   totals (identity carried from their most recent row in any round). This
 *   keeps them visible in the list instead of disappearing when the user
 *   switches to a round they didn't play in.
 */

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'
import {
  categorySubtotals,
  type BreakdownCategory,
} from '@/lib/fantasy/breakdown-categories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type PosType = 'GKP' | 'DEF' | 'MID' | 'FOR'

const CATEGORY_KEYS: BreakdownCategory[] = [
  'attacking',
  'playmaker',
  'passing',
  'defensive',
  'possession',
  'discipline',
  'goalkeepers',
]

interface CategoryPoints {
  attacking: number
  playmaker: number
  passing: number
  defensive: number
  possession: number
  discipline: number
  goalkeepers: number
}

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
  category_points: CategoryPoints
  attacking: {
    goals: number
    assists: number
    sot: number
    sh: number
    kp: number
    bc: number
    // v1.5 additions
    touches_in_box: number
    won_contest: number
    was_fouled: number
  }
  defensive: {
    tackles: number
    interceptions: number
    blocks: number
    clean_sheets: number
    // v1.5 additions
    aerial_won: number
    duels_won: number
  }
  discipline: {
    yc: number
    rc: number
    og: number
    off: number
    // v1.5 additions
    fouls: number
    err_shot: number
    err_goal: number
  }
  passing: {
    pass_acc: number // percentage
    acc_long: number
    ppa: number
    ft3: number
    // v1.5 additions
    acc_crosses: number
    acc_chipped: number
  }
  playmaker: {
    kp: number
    bc: number
    through_balls: number
    touches_in_box: number
    winning_goals: number
    // v1.5 additions
    second_assists: number
  }
  possession: {
    recoveries: number
    duels_won: number
    dispossessed: number
    poss_lost: number
    // v1.5 additions
    turnover: number
  }
  gk?: {
    saves: number
    high_claims: number
    pen_saves: number
    // v1.5 additions
    diving_saves: number
    punches: number
    keeper_throws_acc: number
  }
}

function zeroCategoryPoints(): CategoryPoints {
  return {
    attacking: 0,
    playmaker: 0,
    passing: 0,
    defensive: 0,
    possession: 0,
    discipline: 0,
    goalkeepers: 0,
  }
}

function emptyPlayer(row: {
  opta_player_id: string
  name: string
  first_name: string | null
  last_name: string | null
  team: string
  position: string
  pos_type: PosType
}): AggregatedPlayer {
  const p: AggregatedPlayer = {
    opta_player_id: row.opta_player_id,
    name: row.name,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    team: row.team,
    position: row.position,
    pos_type: row.pos_type,
    games_played: 0,
    mins_total: 0,
    fantasy_points_total: 0,
    fantasy_points_avg: 0,
    fantasy_points_per_90: 0,
    category_points: zeroCategoryPoints(),
    attacking: {
      goals: 0, assists: 0, sot: 0, sh: 0, kp: 0, bc: 0,
      touches_in_box: 0, won_contest: 0, was_fouled: 0,
    },
    defensive: {
      tackles: 0, interceptions: 0, blocks: 0, clean_sheets: 0,
      aerial_won: 0, duels_won: 0,
    },
    discipline: {
      yc: 0, rc: 0, og: 0, off: 0,
      fouls: 0, err_shot: 0, err_goal: 0,
    },
    passing: {
      pass_acc: 0, acc_long: 0, ppa: 0, ft3: 0,
      acc_crosses: 0, acc_chipped: 0,
    },
    playmaker: {
      kp: 0, bc: 0, through_balls: 0, touches_in_box: 0, winning_goals: 0,
      second_assists: 0,
    },
    possession: {
      recoveries: 0, duels_won: 0, dispossessed: 0, poss_lost: 0,
      turnover: 0,
    },
  }
  if (row.pos_type === 'GKP') {
    p.gk = {
      saves: 0, high_claims: 0, pen_saves: 0,
      diving_saves: 0, punches: 0, keeper_throws_acc: 0,
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

    // Get competition ID
    const { data: comp } = await supabase
      .from('fantasy_competitions')
      .select('id')
      .eq('code', competition)
      .single()

    if (!comp) {
      return NextResponse.json({ error: 'Competition not found' }, { status: 404 })
    }

    // ─── Round-scoped rows ─────────────────────────────────────────────
    // These are the rows that actually contribute stats/points. If round != ALL
    // we still fetch only those fixtures' rows here.
    let query = supabase
      .from('fantasy_player_match_stats')
      .select('*')
      .eq('competition_id', comp.id)

    if (round !== 'ALL') {
      // Join with fixtures to filter by round
      const { data: fixtures } = await supabase
        .from('fantasy_fixtures')
        .select('id')
        .eq('competition_id', comp.id)
        .eq('round_code', round)

      const fixtureIds = fixtures?.map(f => f.id) || []
      if (fixtureIds.length === 0) {
        // No fixtures in this round yet — but we still want to return the
        // universe of players with all-zero rows so the list isn't empty
        // mid-tournament when a round hasn't been played.
        // Fall through: fetch identity universe below, skip round query.
        query = query.in('id', ['__nonexistent__']) // force empty result
      } else {
        query = query.in('fixture_id', fixtureIds)
      }
    }

    if (position !== 'ALL') {
      query = query.eq('pos_type', position)
    }

    if (nation) {
      query = query.eq('team', nation)
    }

    if (search) {
      query = query.ilike('name', `${search}%`)
    }

    const { data: rows, error } = await query
    if (error) throw error

    // Aggregate round-scoped rows by player
    const playerMap = new Map<string, any[]>()
    for (const row of rows || []) {
      if (!playerMap.has(row.opta_player_id)) {
        playerMap.set(row.opta_player_id, [])
      }
      playerMap.get(row.opta_player_id)!.push(row)
    }

    const aggregated: AggregatedPlayer[] = []

    for (const [optaId, matches] of playerMap) {
      const first = matches[0]
      const gamesPlayed = matches.length
      const minsTotal = matches.reduce((sum, m) => sum + (m.mins || 0), 0)
      const ptsTotal = matches.reduce((sum, m) => sum + (m.fantasy_points || 0), 0)

      // Aggregate raw stats
      const sumRawStat = (key: string) =>
        matches.reduce((sum, m) => sum + ((m.raw_stats?.[key] as number) || 0), 0)

      const totalPass = sumRawStat('totalPass')
      const accuratePass = sumRawStat('accuratePass')
      const passAcc = totalPass > 0 ? Math.round((accuratePass / totalPass) * 100) : 0

      // Category subtotals: sum per-match categorySubtotals(breakdown)
      const catTotals = zeroCategoryPoints()
      for (const m of matches) {
        const sub = categorySubtotals(m.breakdown as Record<string, unknown> | null)
        for (const k of CATEGORY_KEYS) catTotals[k] += sub[k]
      }
      // Round to 2dp
      const category_points: CategoryPoints = {
        attacking: Math.round(catTotals.attacking * 100) / 100,
        playmaker: Math.round(catTotals.playmaker * 100) / 100,
        passing: Math.round(catTotals.passing * 100) / 100,
        defensive: Math.round(catTotals.defensive * 100) / 100,
        possession: Math.round(catTotals.possession * 100) / 100,
        discipline: Math.round(catTotals.discipline * 100) / 100,
        goalkeepers: Math.round(catTotals.goalkeepers * 100) / 100,
      }

      const player: AggregatedPlayer = {
        opta_player_id: optaId,
        name: first.name,
        first_name: first.first_name ?? null,
        last_name: first.last_name ?? null,
        team: first.team,
        position: first.position,
        pos_type: first.pos_type,
        games_played: gamesPlayed,
        mins_total: minsTotal,
        fantasy_points_total: Math.round(ptsTotal * 100) / 100,
        fantasy_points_avg: Math.round((ptsTotal / gamesPlayed) * 100) / 100,
        fantasy_points_per_90: minsTotal > 0
          ? Math.round((ptsTotal * 90 / minsTotal) * 100) / 100
          : 0,
        category_points,
        attacking: {
          goals: sumRawStat('goals'),
          assists: sumRawStat('goalAssist'),
          sot: sumRawStat('ontargetScoringAtt'),
          sh: sumRawStat('totalScoringAtt'),
          kp: sumRawStat('totalAttAssist'),
          bc: sumRawStat('bigChanceCreated'),
          touches_in_box: sumRawStat('touchesInOppBox'),
          won_contest: sumRawStat('wonContest'),
          was_fouled: sumRawStat('wasFouled'),
        },
        defensive: {
          tackles: sumRawStat('wonTackle'),
          interceptions: sumRawStat('interceptionWon'),
          blocks: sumRawStat('outfielderBlock'),
          clean_sheets: matches.filter(m => m.breakdown?.clean_sheet).length,
          aerial_won: sumRawStat('aerialWon'),
          duels_won: sumRawStat('duelWon'),
        },
        discipline: {
          yc: sumRawStat('yellowCard'),
          rc: sumRawStat('redCard'),
          og: sumRawStat('ownGoals'),
          off: sumRawStat('totalOffside'),
          fouls: sumRawStat('fouls'),
          err_shot: sumRawStat('errorLeadToShot'),
          err_goal: sumRawStat('errorLeadToGoal'),
        },
        passing: {
          pass_acc: passAcc,
          acc_long: sumRawStat('accurateLongBalls'),
          ppa: sumRawStat('successfulPenAreaEntries'),
          ft3: sumRawStat('successfulFinalThirdPasses'),
          acc_crosses: sumRawStat('accurateCrossNocorner'),
          acc_chipped: sumRawStat('accurateChippedPass'),
        },
        playmaker: {
          kp: sumRawStat('totalAttAssist'),
          bc: sumRawStat('bigChanceCreated'),
          through_balls: sumRawStat('accurateThroughBall'),
          touches_in_box: sumRawStat('touchesInOppBox'),
          winning_goals: sumRawStat('winningGoal'),
          second_assists: sumRawStat('secondGoalAssist'),
        },
        possession: {
          recoveries: sumRawStat('ballRecovery'),
          duels_won: sumRawStat('duelWon'),
          dispossessed: sumRawStat('dispossessed'),
          poss_lost: sumRawStat('possLostAll'),
          turnover: sumRawStat('turnover'),
        },
      }

      if (first.pos_type === 'GKP') {
        player.gk = {
          saves: sumRawStat('saves'),
          high_claims: sumRawStat('goodHighClaim'),
          pen_saves: sumRawStat('penaltySave'),
          diving_saves: sumRawStat('divingSave'),
          punches: sumRawStat('punches'),
          keeper_throws_acc: sumRawStat('accurateKeeperThrows'),
        }
      }

      aggregated.push(player)
    }

    // ─── Fill-in-zeros for round-scoped queries ───────────────────────
    // Grab identity for every player who has ≥1 row in the competition, honoring
    // position/team/search filters. Any player NOT already in `aggregated` gets
    // a zero row using their identity from the universe query.
    if (round !== 'ALL') {
      let universeQuery = supabase
        .from('fantasy_player_match_stats')
        .select('opta_player_id, name, first_name, last_name, team, position, pos_type')
        .eq('competition_id', comp.id)

      if (position !== 'ALL') universeQuery = universeQuery.eq('pos_type', position)
      if (nation) universeQuery = universeQuery.eq('team', nation)
      if (search) universeQuery = universeQuery.ilike('name', `${search}%`)

      const { data: universeRows, error: universeErr } = await universeQuery
      if (universeErr) throw universeErr

      // Dedupe by opta_player_id — keep the last row we see (identity should
      // be stable across rounds; if it drifts we prefer the latest).
      const identityMap = new Map<string, {
        opta_player_id: string
        name: string
        first_name: string | null
        last_name: string | null
        team: string
        position: string
        pos_type: PosType
      }>()
      for (const r of (universeRows || []) as Array<Record<string, unknown>>) {
        identityMap.set(r.opta_player_id as string, {
          opta_player_id: r.opta_player_id as string,
          name: r.name as string,
          first_name: (r.first_name as string | null) ?? null,
          last_name: (r.last_name as string | null) ?? null,
          team: r.team as string,
          position: r.position as string,
          pos_type: r.pos_type as PosType,
        })
      }

      const have = new Set(aggregated.map(p => p.opta_player_id))
      for (const [optaId, ident] of identityMap) {
        if (have.has(optaId)) continue
        aggregated.push(emptyPlayer(ident))
      }
    }

    // ─── Sort ─────────────────────────────────────────────────────────
    // Supported sort keys:
    //   fantasy_points:desc
    //   fantasy_points_per_90:desc
    //   name:asc|desc
    //   category:<cat>:desc                → category_points[cat]
    //   category_per90:<cat>:desc          → category_points[cat] * 90 / mins
    const sortParts = sort.split(':')
    const sortField = sortParts[0]
    const sortDir = sortParts[sortParts.length - 1]

    aggregated.sort((a, b) => {
      let aVal: any
      let bVal: any
      if (sortField === 'fantasy_points') {
        aVal = a.fantasy_points_total
        bVal = b.fantasy_points_total
      } else if (sortField === 'fantasy_points_per_90' || sortField === 'pts_per_90') {
        // Require at least 25 minutes to qualify for per-90 ranking (filters out late-sub noise)
        aVal = a.mins_total >= 25 ? a.fantasy_points_per_90 : -1
        bVal = b.mins_total >= 25 ? b.fantasy_points_per_90 : -1
      } else if (sortField === 'category' && sortParts.length >= 3) {
        const cat = sortParts[1] as BreakdownCategory
        aVal = a.category_points?.[cat] ?? 0
        bVal = b.category_points?.[cat] ?? 0
      } else if (sortField === 'category_per90' && sortParts.length >= 3) {
        const cat = sortParts[1] as BreakdownCategory
        aVal = a.mins_total >= 25
          ? ((a.category_points?.[cat] ?? 0) * 90) / a.mins_total
          : -1
        bVal = b.mins_total >= 25
          ? ((b.category_points?.[cat] ?? 0) * 90) / b.mins_total
          : -1
      } else if (sortField === 'name') {
        aVal = a.name
        bVal = b.name
      } else {
        aVal = a.fantasy_points_total
        bVal = b.fantasy_points_total
      }
      if (sortDir === 'desc') return bVal > aVal ? 1 : -1
      return aVal > bVal ? 1 : -1
    })

    const result = aggregated.slice(0, limit)

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
