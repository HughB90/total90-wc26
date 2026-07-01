/**
 * GET /api/fantasy/players
 * 
 * Query params:
 *   - competition (default: WC2026)
 *   - round (default: ALL → aggregate; or specific round_code like 'WC2026-MD1')
 *   - position (ALL | GK | DEF | MID | FWD)
 *   - nation (optional team name filter)
 *   - sort (default: fantasy_points:desc)
 *   - limit (default 100, max 500)
 *   - search (name prefix match)
 * 
 * Returns aggregated player stats when round=ALL, per-round otherwise.
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
    pass_acc: number // percentage
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

    // Optional per-round filter → resolve fixture ids up front
    let fixtureIdFilter: string[] | null = null
    if (round !== 'ALL') {
      const { data: fixtures } = await supabase
        .from('fantasy_fixtures')
        .select('id')
        .eq('competition_id', comp.id)
        .eq('round_code', round)
      fixtureIdFilter = fixtures?.map(f => f.id) || []
      if (fixtureIdFilter.length === 0) {
        return NextResponse.json([])
      }
    }

    // Paginate: Supabase default page limit is 1000 rows, but the WC2026
    // match-stats table has thousands of rows and we need ALL of them
    // in order to aggregate per-player totals correctly. Loop with
    // .range() until we exhaust the result set. (Bug fix 2026-07-01:
    // Messi's MD1 row was being dropped because it sat past row 1000.)
    const PAGE = 1000
    const rows: any[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from('fantasy_player_match_stats')
        .select('*')
        .eq('competition_id', comp.id)
      if (fixtureIdFilter) q = q.in('fixture_id', fixtureIdFilter)
      if (position !== 'ALL') q = q.eq('pos_type', position)
      if (nation) q = q.eq('team', nation)
      if (search) q = q.ilike('name', `${search}%`)
      const { data: page, error } = await q.range(from, from + PAGE - 1)
      if (error) throw error
      if (!page || page.length === 0) break
      rows.push(...page)
      if (page.length < PAGE) break
    }

    // Aggregate by player
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
        attacking: {
          goals: sumRawStat('goals'),
          assists: sumRawStat('goalAssist'),
          sot: sumRawStat('ontargetScoringAtt'),
          sh: sumRawStat('totalScoringAtt'),
          kp: sumRawStat('totalAttAssist'),
          bc: sumRawStat('bigChanceCreated'),
        },
        defensive: {
          tackles: sumRawStat('wonTackle'),
          interceptions: sumRawStat('interceptionWon'),
          blocks: sumRawStat('outfielderBlock'),
          clean_sheets: matches.filter(m => m.breakdown?.clean_sheet).length,
        },
        discipline: {
          yc: sumRawStat('yellowCard'),
          rc: sumRawStat('redCard'),
          og: sumRawStat('ownGoals'),
          off: sumRawStat('totalOffside'),
        },
        passing: {
          pass_acc: passAcc,
          acc_long: sumRawStat('accurateLongBalls'),
          ppa: sumRawStat('successfulPenAreaEntries'),
          ft3: sumRawStat('successfulFinalThirdPasses'),
        },
        playmaker: {
          kp: sumRawStat('totalAttAssist'),
          bc: sumRawStat('bigChanceCreated'),
          through_balls: sumRawStat('accurateThroughBall'),
          touches_in_box: sumRawStat('touchesInOppBox'),
          winning_goals: sumRawStat('winningGoal'),
        },
        possession: {
          recoveries: sumRawStat('ballRecovery'),
          duels_won: sumRawStat('duelWon'),
          dispossessed: sumRawStat('dispossessed'),
          poss_lost: sumRawStat('possLostAll'),
        },
      }

      if (first.pos_type === 'GKP') {
        player.gk = {
          saves: sumRawStat('saves'),
          high_claims: sumRawStat('goodHighClaim'),
          pen_saves: sumRawStat('penaltySave'),
        }
      }

      aggregated.push(player)
    }

    // Sort
    const [sortField, sortDir] = sort.split(':')
    aggregated.sort((a, b) => {
      let aVal: any = a
      let bVal: any = b
      if (sortField === 'fantasy_points') {
        aVal = a.fantasy_points_total
        bVal = b.fantasy_points_total
      } else if (sortField === 'fantasy_points_per_90' || sortField === 'pts_per_90') {
        // Require at least 25 minutes to qualify for per-90 ranking (filters out late-sub noise)
        aVal = a.mins_total >= 25 ? a.fantasy_points_per_90 : -1
        bVal = b.mins_total >= 25 ? b.fantasy_points_per_90 : -1
      } else if (sortField === 'name') {
        aVal = a.name
        bVal = b.name
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
