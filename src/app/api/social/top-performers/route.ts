/**
 * GET /api/social/top-performers
 *
 * Returns the top-N fantasy players for a given competition / round /
 * position, sorted by the chosen metric. Powers the /fantasy/social
 * ranked-list graphic generator.
 *
 * **PUBLIC endpoint** — no auth gate. Validates inputs strictly but
 * surfaces no admin surface. Discoverable by anyone who finds the URL.
 *
 * Query params:
 *   - competition  (default: WC2026)
 *   - round        (round_code like 'WC2026-MD1', or 'ALL') — default 'ALL'
 *   - position     (GK | DEF | MID | FWD)  default: FWD
 *                  Aliases: GKP→GK, FOR→FWD also accepted.
 *   - metric       (fantasy_points | cat_attacking | cat_defensive |
 *                   cat_possession | cat_passing | cat_playmaker |
 *                   cat_discipline | cat_goalkeeping |
 *                   goals | assists | g_a | shots | pass_acc |
 *                   tackles | interceptions | clean_sheets | saves)
 *                  default: fantasy_points
 *   - limit        (default 10, max 25)
 *
 * Response 200:
 *   {
 *     ok: true,
 *     round, position, metric, competition,
 *     players: [
 *       { rank, opta_player_id, name, first_name, last_name, team,
 *         flag_code, photo_url, value, games_played, mins_total }
 *     ]
 *   }
 */

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'
import { PREDICTOR_FLAG_CODES } from '@/lib/predictor-flags'
import {
  BREAKDOWN_CATEGORY,
  type BreakdownCategory,
} from '@/lib/fantasy/breakdown-categories'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ---------- metric mapping ----------

type MetricKey =
  | 'fantasy_points'
  | 'cat_attacking'
  | 'cat_defensive'
  | 'cat_possession'
  | 'cat_passing'
  | 'cat_playmaker'
  | 'cat_discipline'
  | 'cat_goalkeeping'
  | 'goals'
  | 'assists'
  | 'g_a'
  | 'shots'
  | 'pass_acc'
  | 'tackles'
  | 'interceptions'
  | 'clean_sheets'
  | 'saves'

const ALLOWED_METRICS: MetricKey[] = [
  'fantasy_points',
  'cat_attacking',
  'cat_defensive',
  'cat_possession',
  'cat_passing',
  'cat_playmaker',
  'cat_discipline',
  'cat_goalkeeping',
  'goals',
  'assists',
  'g_a',
  'shots',
  'pass_acc',
  'tackles',
  'interceptions',
  'clean_sheets',
  'saves',
]

const CATEGORY_FROM_METRIC: Partial<Record<MetricKey, BreakdownCategory>> = {
  cat_attacking: 'attacking',
  cat_defensive: 'defensive',
  cat_possession: 'possession',
  cat_passing: 'passing',
  cat_playmaker: 'playmaker',
  cat_discipline: 'discipline',
  cat_goalkeeping: 'goalkeepers',
}

// Position normalization: spec uses GK/DEF/MID/FWD; DB uses GKP/DEF/MID/FOR.
const POS_PUBLIC_TO_DB: Record<string, string> = {
  GK: 'GKP',
  GKP: 'GKP',
  DEF: 'DEF',
  MID: 'MID',
  FWD: 'FOR',
  FOR: 'FOR',
}

// ---------- helpers ----------

function flagCodeFor(country: string | null | undefined): string | null {
  if (!country) return null
  return PREDICTOR_FLAG_CODES[country] ?? country.toLowerCase().replace(/\s+/g, '-')
}

interface PlayerStatRow {
  opta_player_id: string
  fixture_id: string
  name: string
  first_name: string | null
  last_name: string | null
  team: string
  position: string
  pos_type: string
  mins: number | null
  fantasy_points: number | null
  raw_stats: Record<string, unknown> | null
  breakdown: Record<string, unknown> | null
}

function sumRaw(rows: PlayerStatRow[], key: string): number {
  let total = 0
  for (const r of rows) {
    const v = r.raw_stats?.[key]
    if (typeof v === 'number') total += v
  }
  return total
}

function passAccPct(rows: PlayerStatRow[]): number {
  const totalPass = sumRaw(rows, 'totalPass')
  const accurate = sumRaw(rows, 'accuratePass')
  return totalPass > 0 ? Math.round((accurate / totalPass) * 1000) / 10 : 0
}

function countCleanSheets(rows: PlayerStatRow[]): number {
  let n = 0
  for (const r of rows) {
    const cs = r.breakdown?.['clean_sheet']
    if (cs) n++
  }
  return n
}

/**
 * Sum a single breakdown category across all matches for a player.
 */
function sumCategory(rows: PlayerStatRow[], category: BreakdownCategory): number {
  let total = 0
  for (const r of rows) {
    const bd = r.breakdown
    if (!bd || typeof bd !== 'object') continue
    for (const [k, v] of Object.entries(bd)) {
      if (typeof v !== 'number') continue
      if (BREAKDOWN_CATEGORY[k] === category) total += v
    }
  }
  return Math.round(total * 10) / 10
}

// ---------- handler ----------

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const competition = url.searchParams.get('competition') || 'WC2026'
    const round = url.searchParams.get('round') || 'ALL'
    const positionRaw = (url.searchParams.get('position') || 'FWD').toUpperCase()
    const metricRaw = (url.searchParams.get('metric') || 'fantasy_points') as MetricKey
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10', 10) || 10, 1), 25)

    const posDb = POS_PUBLIC_TO_DB[positionRaw]
    if (!posDb) {
      return NextResponse.json(
        { ok: false, error: `invalid position '${positionRaw}'. Allowed: GK, DEF, MID, FWD` },
        { status: 422 },
      )
    }

    if (!ALLOWED_METRICS.includes(metricRaw)) {
      return NextResponse.json(
        { ok: false, error: `invalid metric '${metricRaw}'.` },
        { status: 422 },
      )
    }

    const metric = metricRaw

    const sb = createAdminSupabase()

    // Resolve competition_id
    const { data: comp, error: compErr } = await sb
      .from('fantasy_competitions')
      .select('id')
      .eq('code', competition)
      .single()
    if (compErr || !comp) {
      return NextResponse.json(
        { ok: false, error: `competition not found: ${competition}` },
        { status: 404 },
      )
    }

    // Build stats query
    let query = sb
      .from('fantasy_player_match_stats')
      .select('opta_player_id, fixture_id, name, first_name, last_name, team, position, pos_type, mins, fantasy_points, raw_stats, breakdown')
      .eq('competition_id', comp.id)
      .eq('pos_type', posDb)

    if (round !== 'ALL') {
      const { data: fixtures, error: fxErr } = await sb
        .from('fantasy_fixtures')
        .select('id')
        .eq('competition_id', comp.id)
        .eq('round_code', round)
      if (fxErr) {
        return NextResponse.json({ ok: false, error: fxErr.message }, { status: 500 })
      }
      const fixtureIds = (fixtures ?? []).map((f) => f.id)
      if (fixtureIds.length === 0) {
        return NextResponse.json({
          ok: true,
          round,
          position: positionRaw,
          metric,
          competition,
          players: [],
        })
      }
      query = query.in('fixture_id', fixtureIds)
    }

    const { data: rows, error: rowsErr } = await query
    if (rowsErr) {
      return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 })
    }

    // Group by player
    const grouped = new Map<string, PlayerStatRow[]>()
    for (const r of (rows ?? []) as PlayerStatRow[]) {
      if (!grouped.has(r.opta_player_id)) grouped.set(r.opta_player_id, [])
      grouped.get(r.opta_player_id)!.push(r)
    }

    type Agg = {
      opta_player_id: string
      name: string
      first_name: string | null
      last_name: string | null
      team: string
      games_played: number
      mins_total: number
      value: number
      fantasy_points: number
      goals: number
      assists: number
    }

    const aggregated: Agg[] = []
    for (const [optaId, matches] of grouped) {
      const first = matches[0]
      const minsTotal = matches.reduce((s, m) => s + (m.mins || 0), 0)
      if (minsTotal === 0) continue

      const goals = sumRaw(matches, 'goals')
      const assists = sumRaw(matches, 'goalAssist')
      const shots = sumRaw(matches, 'totalScoringAtt')
      const tackles = sumRaw(matches, 'wonTackle') || sumRaw(matches, 'totalTackle')
      const interceptions = sumRaw(matches, 'interceptionWon')
      const saves = sumRaw(matches, 'saves')
      const ptsTotal = matches.reduce((s, m) => s + (m.fantasy_points || 0), 0)
      const ptsRounded = Math.round(ptsTotal * 10) / 10

      let value = 0
      const catKey = CATEGORY_FROM_METRIC[metric]
      if (catKey) {
        value = sumCategory(matches, catKey)
      } else {
        switch (metric) {
          case 'fantasy_points': value = ptsRounded; break
          case 'goals': value = goals; break
          case 'assists': value = assists; break
          case 'g_a': value = goals + assists; break
          case 'shots': value = shots; break
          case 'pass_acc': value = passAccPct(matches); break
          case 'tackles': value = tackles; break
          case 'interceptions': value = interceptions; break
          case 'clean_sheets': value = countCleanSheets(matches); break
          case 'saves': value = saves; break
        }
      }

      aggregated.push({
        opta_player_id: optaId,
        name: first.name,
        first_name: first.first_name,
        last_name: first.last_name,
        team: first.team,
        games_played: matches.length,
        mins_total: minsTotal,
        value,
        fantasy_points: ptsRounded,
        goals,
        assists,
      })
    }

    aggregated.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value
      if (b.fantasy_points !== a.fantasy_points) return b.fantasy_points - a.fantasy_points
      return b.mins_total - a.mins_total
    })

    const top = aggregated.slice(0, limit)

    // Photo join via t90_players keyed on opta_id (canonical). Falls back to
    // s3_players name+nationality for the rare case a row is missing.
    const optaIds = top.map((p) => p.opta_player_id).filter(Boolean)
    const photoById = new Map<string, string | null>()

    if (optaIds.length > 0) {
      const { data: t90Rows, error: t90Err } = await sb
        .from('t90_players')
        .select('opta_id, photo_url')
        .in('opta_id', optaIds)
      if (!t90Err && t90Rows) {
        for (const row of t90Rows as Array<{ opta_id: string | null; photo_url: string | null }>) {
          if (!row.opta_id) continue
          photoById.set(row.opta_id, row.photo_url ?? null)
        }
      }
    }

    const players = top.map((p, i) => {
      const photo_url = photoById.get(p.opta_player_id) ?? null
      return {
        rank: i + 1,
        opta_player_id: p.opta_player_id,
        name: p.name,
        first_name: p.first_name,
        last_name: p.last_name,
        team: p.team,
        flag_code: flagCodeFor(p.team),
        photo_url,
        value: p.value,
        games_played: p.games_played,
        mins_total: p.mins_total,
        fantasy_points: p.fantasy_points,
        goals: p.goals,
        assists: p.assists,
      }
    })

    return NextResponse.json(
      {
        ok: true,
        round,
        position: positionRaw,
        metric,
        competition,
        players,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/social/top-performers] error:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
