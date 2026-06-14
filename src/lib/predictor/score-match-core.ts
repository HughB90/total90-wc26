/**
 * WC26 Predictor — score-match core
 *
 * In-process scoring engine. Pure-ish (touches Supabase, but no HTTP).
 * Used by:
 *   - POST /api/predictor/score-match (admin / manual retry)
 *   - GET  /api/cron/sync-wc26-fixtures (auto-trigger on status flip + sweep)
 *
 * Why a shared core: previously the cron did an internal `fetch()` back to
 * the same deployment's /api/predictor/score-match. That added a cold-start +
 * function-timeout roundtrip and failed silently in production for matches
 * 4–7 of group_r1 (USA, Qatar, Brazil, Haiti). Calling this function directly
 * removes the second function invocation entirely.
 *
 * Idempotent. Safe to call multiple times for the same match — predictor_scores
 * upserts by (profile_id, match_id) and leaderboard cache is fully re-summed.
 */

import {
  scorePick,
  type MatchActual,
  type PickInput,
  type RoundCode,
} from './scoring'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types matching DB schema (kept in sync with /api/predictor/score-match)
// ---------------------------------------------------------------------------

interface PredictorMatchRow {
  id: string
  round_code: RoundCode
  home_team_code: string
  away_team_code: string
  home_score: number | null
  away_score: number | null
  went_to_pks: boolean | null
  pk_winner_team_code: string | null
  goalscorers: unknown
  status: string
}

interface PredictorPickRow {
  id: string
  profile_id: string
  match_id: string
  home_score: number
  away_score: number
  if_draw_winner: string | null
  pk_advance_team_id: string | null
  is_star: boolean
  goalscorer_player_id: string | null
  goalscorer_team_code: string | null
}

interface PredictorScoreInsert {
  profile_id: string
  match_id: string
  exact_pts: number
  result_pts: number
  scorer_pts: number
  star_multiplier: number
}

interface RoundBuckets {
  r1_pts: number
  r2_pts: number
  r3_pts: number
  r32_pts: number
  r16_pts: number
  qf_pts: number
  sf_pts: number
  final_pts: number
}

const ROUND_TO_CACHE_COL: Record<RoundCode, keyof RoundBuckets> = {
  group_r1: 'r1_pts',
  group_r2: 'r2_pts',
  group_r3: 'r3_pts',
  r32: 'r32_pts',
  r16: 'r16_pts',
  qf: 'qf_pts',
  sf: 'sf_pts',
  final: 'final_pts',
}

function emptyBuckets(): RoundBuckets {
  return {
    r1_pts: 0, r2_pts: 0, r3_pts: 0, r32_pts: 0,
    r16_pts: 0, qf_pts: 0, sf_pts: 0, final_pts: 0,
  }
}

function parseGoalscorers(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (raw !== null && raw !== undefined) {
      console.warn('[score-match-core] goalscorers is not an array, ignoring:', typeof raw)
    }
    return []
  }
  const ids: string[] = []
  for (const entry of raw) {
    if (typeof entry === 'string') {
      ids.push(entry)
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      const candidate = obj.player_id ?? obj.id ?? obj.playerId
      if (typeof candidate === 'string') ids.push(candidate)
    }
  }
  return ids
}

export interface ScoreMatchResult {
  ok: boolean
  match_id: string
  scored_profiles?: number
  cache_refreshed?: number
  error?: string
  status?: number          // suggested HTTP status if the caller is an API
  match?: {
    round_code: RoundCode
    home_team_code: string
    away_team_code: string
    home_score: number
    away_score: number
    went_to_pks: boolean
    pk_winner_team_code: string | null
    goalscorer_count: number
  }
}

/**
 * Score a single finalized match against all submitted picks, then refresh
 * leaderboard cache for every touched profile.
 *
 * Never throws. Returns a structured result. Callers (route handler / cron)
 * decide what to do with non-ok results.
 */
export async function scoreMatchById(
  sb: SupabaseClient,
  matchId: string,
): Promise<ScoreMatchResult> {
  try {
    console.log(`[score-match-core] start match_id=${matchId}`)

    // -- Load match ---------------------------------------------------------
    const { data: matchRow, error: matchErr } = await sb
      .from('predictor_matches')
      .select(
        'id, round_code, home_team_code, away_team_code, home_score, away_score, went_to_pks, pk_winner_team_code, goalscorers, status',
      )
      .eq('id', matchId)
      .maybeSingle()

    if (matchErr) {
      console.error('[score-match-core] match lookup error:', matchErr.message)
      return { ok: false, match_id: matchId, error: matchErr.message, status: 500 }
    }
    if (!matchRow) {
      return { ok: false, match_id: matchId, error: 'match_not_found', status: 404 }
    }

    const match = matchRow as PredictorMatchRow

    if (match.home_score === null || match.away_score === null) {
      return {
        ok: false,
        match_id: matchId,
        error: 'match_not_finalized',
        status: 422,
      }
    }

    const scorerIds = parseGoalscorers(match.goalscorers)

    // -- Load picks ---------------------------------------------------------
    const { data: pickRows, error: picksErr } = await sb
      .from('predictor_picks')
      .select(
        'id, profile_id, match_id, home_score, away_score, if_draw_winner, pk_advance_team_id, is_star, goalscorer_player_id, goalscorer_team_code',
      )
      .eq('match_id', matchId)

    if (picksErr) {
      console.error('[score-match-core] picks load error:', picksErr.message)
      return { ok: false, match_id: matchId, error: picksErr.message, status: 500 }
    }

    const picks = (pickRows ?? []) as PredictorPickRow[]

    const actual: MatchActual = {
      home_score: match.home_score,
      away_score: match.away_score,
      went_to_pks: match.went_to_pks ?? false,
      pk_winner_team_id: match.pk_winner_team_code ?? null,
      scorer_player_ids: scorerIds,
      round_code: match.round_code,
    }

    const scoreInserts: PredictorScoreInsert[] = []
    const affectedProfileIds = new Set<string>()

    for (const p of picks) {
      const pickInput: PickInput = {
        home_score: p.home_score,
        away_score: p.away_score,
        scorer_player_ids: p.goalscorer_player_id ? [p.goalscorer_player_id] : [],
        pk_advance_team_id: p.pk_advance_team_id ?? p.if_draw_winner ?? null,
        is_star: p.is_star,
        home_team_id: match.home_team_code,
        away_team_id: match.away_team_code,
      }
      const result = scorePick(pickInput, actual)
      scoreInserts.push({
        profile_id: p.profile_id,
        match_id: match.id,
        exact_pts: result.exact_pts,
        result_pts: result.result_pts,
        scorer_pts: result.scorer_pts,
        star_multiplier: result.star_multiplier,
      })
      affectedProfileIds.add(p.profile_id)
    }

    if (scoreInserts.length > 0) {
      const { error: upsertErr } = await sb
        .from('predictor_scores')
        .upsert(scoreInserts, {
          onConflict: 'profile_id,match_id',
          ignoreDuplicates: false,
        })
      if (upsertErr) {
        console.error('[score-match-core] predictor_scores upsert error:', upsertErr.message)
        return { ok: false, match_id: matchId, error: upsertErr.message, status: 500 }
      }
    }

    // -- Refresh leaderboard cache per affected profile --------------------
    let cacheRefreshed = 0
    if (affectedProfileIds.size > 0) {
      const profileIdList = Array.from(affectedProfileIds)

      const { data: allScores, error: scoresErr } = await sb
        .from('predictor_scores')
        .select('profile_id, match_id, total_pts, exact_pts')
        .in('profile_id', profileIdList)
      if (scoresErr) {
        console.error('[score-match-core] scores re-read error:', scoresErr.message)
        return { ok: false, match_id: matchId, error: scoresErr.message, status: 500 }
      }

      const referencedMatchIds = Array.from(
        new Set((allScores ?? []).map((s) => s.match_id as string)),
      )
      const matchIdToRound = new Map<string, RoundCode>()
      if (referencedMatchIds.length > 0) {
        const { data: matchRows, error: mErr } = await sb
          .from('predictor_matches')
          .select('id, round_code')
          .in('id', referencedMatchIds)
        if (mErr) {
          console.error('[score-match-core] match round lookup error:', mErr.message)
          return { ok: false, match_id: matchId, error: mErr.message, status: 500 }
        }
        for (const m of matchRows ?? []) {
          matchIdToRound.set(m.id as string, m.round_code as RoundCode)
        }
      }

      type ProfileAgg = {
        total_pts: number
        exact_score_pts_only: number
        buckets: RoundBuckets
      }
      const aggs = new Map<string, ProfileAgg>()
      for (const pid of profileIdList) {
        aggs.set(pid, { total_pts: 0, exact_score_pts_only: 0, buckets: emptyBuckets() })
      }

      for (const s of allScores ?? []) {
        const pid = s.profile_id as string
        const agg = aggs.get(pid)
        if (!agg) continue
        const total = (s.total_pts as number | null) ?? 0
        const exact = (s.exact_pts as number | null) ?? 0
        agg.total_pts += total
        agg.exact_score_pts_only += exact
        const round = matchIdToRound.get(s.match_id as string)
        if (round) agg.buckets[ROUND_TO_CACHE_COL[round]] += total
      }

      const { data: existingCache, error: cacheReadErr } = await sb
        .from('predictor_leaderboard_cache')
        .select('profile_id, winner_pick_pts')
        .in('profile_id', profileIdList)
      if (cacheReadErr) {
        console.error('[score-match-core] cache read error:', cacheReadErr.message)
        return { ok: false, match_id: matchId, error: cacheReadErr.message, status: 500 }
      }
      const existingWinnerPts = new Map<string, number>()
      for (const row of existingCache ?? []) {
        existingWinnerPts.set(row.profile_id as string, (row.winner_pick_pts as number | null) ?? 0)
      }

      const nowIso = new Date().toISOString()
      const cacheUpserts = profileIdList.map((pid) => {
        const agg = aggs.get(pid)!
        return {
          profile_id: pid,
          total_pts: agg.total_pts,
          exact_score_pts_only: agg.exact_score_pts_only,
          r1_pts: agg.buckets.r1_pts,
          r2_pts: agg.buckets.r2_pts,
          r3_pts: agg.buckets.r3_pts,
          r32_pts: agg.buckets.r32_pts,
          r16_pts: agg.buckets.r16_pts,
          qf_pts: agg.buckets.qf_pts,
          sf_pts: agg.buckets.sf_pts,
          final_pts: agg.buckets.final_pts,
          winner_pick_pts: existingWinnerPts.get(pid) ?? 0,
          updated_at: nowIso,
        }
      })

      const { error: cacheErr } = await sb
        .from('predictor_leaderboard_cache')
        .upsert(cacheUpserts, {
          onConflict: 'profile_id',
          ignoreDuplicates: false,
        })
      if (cacheErr) {
        console.error('[score-match-core] leaderboard cache upsert error:', cacheErr.message)
        return { ok: false, match_id: matchId, error: cacheErr.message, status: 500 }
      }
      cacheRefreshed = cacheUpserts.length
    }

    console.log(
      `[score-match-core] ok match=${matchId} scored=${scoreInserts.length} cache=${cacheRefreshed}`,
    )

    return {
      ok: true,
      match_id: matchId,
      scored_profiles: scoreInserts.length,
      cache_refreshed: cacheRefreshed,
      match: {
        round_code: match.round_code,
        home_team_code: match.home_team_code,
        away_team_code: match.away_team_code,
        home_score: match.home_score,
        away_score: match.away_score,
        went_to_pks: match.went_to_pks ?? false,
        pk_winner_team_code: match.pk_winner_team_code,
        goalscorer_count: scorerIds.length,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[score-match-core] unexpected error:', message)
    return { ok: false, match_id: matchId, error: message, status: 500 }
  }
}

/**
 * Sweep: find any status=final match that has predictor_picks rows but
 * no corresponding predictor_scores rows. Score each. Used as a safety
 * net at the end of every cron tick so we self-heal from missed
 * status-transition triggers (e.g. cron timeout during phase4 trigger).
 *
 * Returns the list of match_ids that were healed and their per-match results.
 * Capped at `maxToScore` matches per call to bound runtime.
 */
export async function sweepUnscored(
  sb: SupabaseClient,
  maxToScore = 5,
): Promise<{
  scanned: number
  healed: ScoreMatchResult[]
}> {
  // Find candidate matches: status=final
  const { data: finals, error: finalsErr } = await sb
    .from('predictor_matches')
    .select('id')
    .eq('status', 'final')

  if (finalsErr) {
    console.error('[sweep-unscored] failed to load finals:', finalsErr.message)
    return { scanned: 0, healed: [] }
  }

  const finalIds = (finals ?? []).map((m) => m.id as string)
  if (finalIds.length === 0) return { scanned: 0, healed: [] }

  // Find which of those match_ids already have at least one score row.
  // Single query: select distinct match_id from predictor_scores where match_id in (...)
  const { data: scored, error: scoredErr } = await sb
    .from('predictor_scores')
    .select('match_id')
    .in('match_id', finalIds)

  if (scoredErr) {
    console.error('[sweep-unscored] failed to load scored match_ids:', scoredErr.message)
    return { scanned: finalIds.length, healed: [] }
  }

  const scoredSet = new Set((scored ?? []).map((s) => s.match_id as string))
  const unscored = finalIds.filter((id) => !scoredSet.has(id))

  if (unscored.length === 0) return { scanned: finalIds.length, healed: [] }

  // Confirm they actually have picks to score (avoid scoring a match no one
  // picked — wasted call but harmless).
  const { data: pickRows, error: picksErr } = await sb
    .from('predictor_picks')
    .select('match_id')
    .in('match_id', unscored)

  if (picksErr) {
    console.error('[sweep-unscored] failed to check picks:', picksErr.message)
    return { scanned: finalIds.length, healed: [] }
  }

  const hasPicks = new Set((pickRows ?? []).map((p) => p.match_id as string))
  const needsScoring = unscored.filter((id) => hasPicks.has(id)).slice(0, maxToScore)

  console.log(
    `[sweep-unscored] finals=${finalIds.length} unscored=${unscored.length} needs_scoring=${needsScoring.length}`,
  )

  const healed: ScoreMatchResult[] = []
  for (const mid of needsScoring) {
    const res = await scoreMatchById(sb, mid)
    healed.push(res)
  }

  return { scanned: finalIds.length, healed }
}
