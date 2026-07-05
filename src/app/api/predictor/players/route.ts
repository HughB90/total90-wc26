/**
 * GET /api/predictor/players?team_code=USA[&played_only=1]
 *
 * Returns the squad list for a national team — used by the Anytime Goalscorer
 * picker on R5–R8 round pages.
 *
 * Data source: `s3_players` (canonical roster) LEFT JOINed to
 * `fantasy_player_match_stats` (in-tournament minutes + goals so far) and
 * enriched with tournament-goal counts from `predictor_matches.goalscorers`.
 *
 * Query params:
 *   team_code    — required. Predictor-side shorthand (e.g. "USA" or
 *                  "United States"). Resolved through resolveTeamAliases()
 *                  so either form finds the same roster.
 *   played_only  — "1"/"true" hard-filters to players with mins > 0 across
 *                  fantasy_player_match_stats for this tournament. Used by
 *                  R16+ pickers per Hugh's rule: only surface players who
 *                  have actually played so far. Default false (returns full
 *                  roster).
 *
 * Response:
 *   { team_code, players: Array<{
 *       id, opta_id, name, short_name, last_name, position, photo_url,
 *       mins, goals   // enrichment fields — 0 when no data
 *     }> }
 *
 * Sort order:
 *   goals DESC, then mins DESC, then last_name ASC. This puts the most
 *   productive players at the top of the picker.
 *
 * Public endpoint. 60s edge cache since rosters + game logs don't churn
 * mid-tournament between kickoffs; live in-game updates still refresh
 * within one cache cycle.
 */

import { NextResponse } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'
import { resolveTeamAliases } from '@/lib/predictor/team-aliases'

export const dynamic = 'force-dynamic'

interface GoalscorerEntry {
  scorer_id?: string | null
  scorer_name?: string | null
  type?: string | null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const teamCodeRaw = url.searchParams.get('team_code')?.trim()
  if (!teamCodeRaw) {
    return NextResponse.json({ error: 'team_code_required' }, { status: 400 })
  }
  const playedOnly = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('played_only') || '').toLowerCase(),
  )

  const aliases = resolveTeamAliases(teamCodeRaw)
  const sb = predictorAdmin()

  // 1) Roster from s3_players
  const { data: roster, error } = await sb
    .from('s3_players')
    .select('id, opta_id, name, short_name, last_name, position, photo_url')
    .in('nationality', aliases)
    .eq('is_active', true)
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const players = roster ?? []

  // 2) Minutes-so-far from fantasy_player_match_stats. Aggregate per opta_id.
  // Using .in on 'team' to cover naming variants ("United States" vs "USA").
  const minsByOptaId = new Map<string, number>()
  {
    const { data: stats, error: sErr } = await sb
      .from('fantasy_player_match_stats')
      .select('opta_player_id, mins')
      .in('team', aliases)
    if (sErr) {
      // Non-fatal — return roster without enrichment.
      console.warn('[predictor/players] stats fetch failed:', sErr.message)
    } else {
      for (const r of stats ?? []) {
        const oid = r.opta_player_id as string | null
        if (!oid) continue
        minsByOptaId.set(oid, (minsByOptaId.get(oid) ?? 0) + (r.mins ?? 0))
      }
    }
  }

  // 3) Tournament-goals from predictor_matches.goalscorers. We count only
  //    real goals (type != 'OG') keyed by scorer_id. Doing this once per
  //    request is cheap (<200 matches with at most ~5 goals each).
  const goalsByOptaId = new Map<string, number>()
  {
    const { data: matches, error: mErr } = await sb
      .from('predictor_matches')
      .select('goalscorers')
      .not('goalscorers', 'is', null)
    if (mErr) {
      console.warn('[predictor/players] goalscorers fetch failed:', mErr.message)
    } else {
      for (const row of matches ?? []) {
        const arr = row.goalscorers as GoalscorerEntry[] | null
        if (!Array.isArray(arr)) continue
        for (const g of arr) {
          if (!g?.scorer_id || g.type === 'OG') continue
          goalsByOptaId.set(g.scorer_id, (goalsByOptaId.get(g.scorer_id) ?? 0) + 1)
        }
      }
    }
  }

  // 4) Merge enrichment + optional played-only filter + sort
  let enriched = players.map((p) => {
    const oid = p.opta_id as string | null
    const mins = oid ? minsByOptaId.get(oid) ?? 0 : 0
    const goals = oid ? goalsByOptaId.get(oid) ?? 0 : 0
    return { ...p, mins, goals }
  })

  if (playedOnly) {
    enriched = enriched.filter((p) => p.mins > 0)
  }

  enriched.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals
    if (b.mins !== a.mins) return b.mins - a.mins
    return String(a.last_name ?? a.name ?? '').localeCompare(String(b.last_name ?? b.name ?? ''))
  })

  return NextResponse.json(
    { team_code: teamCodeRaw, players: enriched },
    {
      headers: {
        // Public, modest cache; rosters + stats change on ~5min sync cycles.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}
