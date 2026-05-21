/**
 * GET /api/predictor/leaderboard
 *
 * Query params:
 *   league_code  optional — filter rows to members of that league
 *   page         optional, 1-indexed, default 1
 *   page_size    optional, default 25, max 100
 *
 * Response:
 *   {
 *     rows: [{
 *       rank, profile_id, first_name, manager_name, total_pts,
 *       r1_pts..final_pts, winner_pick_pts, my_row,
 *       round_status: { group_r1, group_r2, ..., final }  // pick-status per round (teal|green|red|grey|none)
 *     }],
 *     top3: [...],          // sticky top-3 rows (always returned)
 *     my_row: row | null,   // current profile's row (always returned)
 *     page, page_size, total, total_pages,
 *     league: { code, name, member_count } | null
 *   }
 *
 * Scoring engine is not yet live (Phase 4 deferred per spec). Until then,
 * total_pts and per-round_pts will be 0 for everyone, but the structure
 * is wired so the page works the moment scoring lands.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'
import { getProfileSession } from '@/lib/predictor-session'
import { PREDICTOR_ROUNDS } from '@/lib/predictor-rounds'

export const dynamic = 'force-dynamic'

const ROUND_CODES = PREDICTOR_ROUNDS.map((r) => r.code)

type LbRow = {
  rank: number
  profile_id: string
  first_name: string
  manager_name: string
  total_pts: number
  per_round: Record<string, number>
  winner_pick_pts: number
  round_status: Record<string, 'submitted' | 'in-progress' | 'open' | 'locked' | 'none'>
  is_me: boolean
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const leagueCode = url.searchParams.get('league_code')?.toUpperCase() ?? null
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(5, parseInt(url.searchParams.get('page_size') ?? '25', 10) || 25))

  const sb = createAdminSupabase()

  // Resolve league + member profile_ids if filtered
  let leagueMeta: { id: string; code: string; name: string; member_count: number } | null = null
  let memberProfileIds: string[] | null = null
  if (leagueCode) {
    const { data: league } = await sb
      .from('wc26_leagues')
      .select('id, name, invite_code')
      .eq('invite_code', leagueCode)
      .maybeSingle()
    if (!league) return NextResponse.json({ error: 'league_not_found' }, { status: 404 })
    const { data: members } = await sb
      .from('wc26_league_members')
      .select('user_id, profile_id')
      .eq('league_id', league.id)
    memberProfileIds = []
    for (const m of (members ?? []) as Array<{ user_id?: string | null; profile_id?: string | null }>) {
      // Members are stored as either profile_id (new) or user_id (legacy bracket).
      if (m.profile_id) memberProfileIds.push(m.profile_id)
    }
    memberProfileIds = Array.from(new Set(memberProfileIds))
    leagueMeta = {
      id: league.id,
      code: league.invite_code,
      name: league.name,
      member_count: memberProfileIds.length,
    }
  }

  // Pull leaderboard cache (or fall back to zeroed rows for anyone with picks).
  let cacheQuery = sb
    .from('predictor_leaderboard_cache')
    .select('profile_id, total_pts, r1_pts, r2_pts, r3_pts, r32_pts, r16_pts, qf_pts, sf_pts, final_pts, winner_pick_pts')
  if (memberProfileIds) cacheQuery = cacheQuery.in('profile_id', memberProfileIds.length ? memberProfileIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: cache } = await cacheQuery

  // Anyone who has *submitted picks* should show on the board, even with 0 pts.
  let pickProfileQuery = sb.from('predictor_picks').select('profile_id')
  if (memberProfileIds) pickProfileQuery = pickProfileQuery.in('profile_id', memberProfileIds.length ? memberProfileIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: pickProfiles } = await pickProfileQuery

  const seenProfileIds = new Set<string>()
  for (const c of (cache ?? []) as Array<{ profile_id: string }>) seenProfileIds.add(c.profile_id)
  for (const p of (pickProfiles ?? []) as Array<{ profile_id: string }>) seenProfileIds.add(p.profile_id)

  const profileIds = Array.from(seenProfileIds)
  if (!profileIds.length) {
    return NextResponse.json({
      rows: [], top3: [], my_row: null,
      page, page_size: pageSize, total: 0, total_pages: 0,
      league: leagueMeta,
    })
  }

  // Pull profile metadata
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, first_name, manager_name')
    .in('id', profileIds)
  const profileMap = new Map<string, { first_name: string; manager_name: string }>()
  for (const p of (profiles ?? []) as Array<{ id: string; first_name: string; manager_name: string }>) {
    profileMap.set(p.id, { first_name: p.first_name, manager_name: p.manager_name })
  }

  // Pull pick counts per (profile, round) for round_status display
  const { data: matches } = await sb.from('predictor_matches').select('id, round_code')
  const matchToRound = new Map<string, string>()
  for (const m of (matches ?? []) as Array<{ id: string; round_code: string }>) {
    matchToRound.set(m.id, m.round_code)
  }

  let pickQuery = sb.from('predictor_picks').select('profile_id, match_id')
  if (memberProfileIds) pickQuery = pickQuery.in('profile_id', memberProfileIds.length ? memberProfileIds : ['00000000-0000-0000-0000-000000000000'])
  const { data: picks } = await pickQuery
  const picksByProfile = new Map<string, Map<string, number>>()
  for (const p of (picks ?? []) as Array<{ profile_id: string; match_id: string }>) {
    const round = matchToRound.get(p.match_id)
    if (!round) continue
    const m = picksByProfile.get(p.profile_id) ?? new Map<string, number>()
    m.set(round, (m.get(round) ?? 0) + 1)
    picksByProfile.set(p.profile_id, m)
  }

  // Build the rows
  const cacheByProfile = new Map<string, Record<string, number>>()
  for (const c of (cache ?? []) as Array<Record<string, number | string>>) {
    cacheByProfile.set(c.profile_id as string, c as Record<string, number>)
  }

  const session = await getProfileSession()
  const meId = session?.profile_id ?? null

  const rows: LbRow[] = profileIds.map((pid) => {
    const meta = profileMap.get(pid) ?? { first_name: '—', manager_name: '—' }
    const c = cacheByProfile.get(pid)
    const per_round: Record<string, number> = {
      group_r1: Number(c?.r1_pts ?? 0),
      group_r2: Number(c?.r2_pts ?? 0),
      group_r3: Number(c?.r3_pts ?? 0),
      r32:      Number(c?.r32_pts ?? 0),
      r16:      Number(c?.r16_pts ?? 0),
      qf:       Number(c?.qf_pts ?? 0),
      sf:       Number(c?.sf_pts ?? 0),
      final:    Number(c?.final_pts ?? 0),
    }
    const round_status: LbRow['round_status'] = {} as LbRow['round_status']
    const pcounts = picksByProfile.get(pid) ?? new Map<string, number>()
    for (const r of PREDICTOR_ROUNDS) {
      const count = pcounts.get(r.code) ?? 0
      // For now, pre-scoring: 'submitted' if count >= required, 'in-progress' if 0<count<required, 'none' if 0.
      // Post-scoring, color (teal/green/red) will live on `predictor_scores.outcome_color`.
      if (per_round[r.code] > 0) round_status[r.code] = 'submitted'
      else if (count >= r.required) round_status[r.code] = 'submitted'
      else if (count > 0) round_status[r.code] = 'in-progress'
      else round_status[r.code] = 'none'
    }
    return {
      rank: 0, // filled below
      profile_id: pid,
      first_name: meta.first_name,
      manager_name: meta.manager_name,
      total_pts: Number(c?.total_pts ?? 0),
      per_round,
      winner_pick_pts: Number(c?.winner_pick_pts ?? 0),
      round_status,
      is_me: meId === pid,
    }
  })

  // Sort by total_pts desc, then by manager_name asc (stable tiebreaker)
  rows.sort((a, b) => b.total_pts - a.total_pts || a.manager_name.localeCompare(b.manager_name))
  for (let i = 0; i < rows.length; i++) rows[i].rank = i + 1

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  const top3 = rows.slice(0, 3)
  const myRow = meId ? rows.find((r) => r.profile_id === meId) ?? null : null

  return NextResponse.json({
    rows: pageRows,
    top3,
    my_row: myRow,
    page, page_size: pageSize, total, total_pages: totalPages,
    league: leagueMeta,
    round_codes: ROUND_CODES,
  })
}
