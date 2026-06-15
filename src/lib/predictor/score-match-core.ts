/**
 * Predictor scoring core.
 *
 * Pure(-ish) module that contains the full scoring pipeline for a single
 * finalized predictor match. Extracted from
 * `src/app/api/predictor/score-match/route.ts` so it can be invoked
 * **in-process** by cron handlers without going over HTTP (which gets
 * bounced by Vercel deployment protection on preview URLs).
 *
 * Behavior is intentionally identical to the previous route handler — the
 * HTTP route is now a thin wrapper around `scoreMatchById`.
 *
 * Auth, request validation, and HTTP response shaping live in the route.
 * This function only deals with: load match → load picks → score → upsert
 * predictor_scores → re-sum leaderboard cache.
 *
 * Idempotent. Safe to re-run. predictor_scores upserts on
 * (profile_id, match_id); leaderboard_cache is full re-sum from
 * predictor_scores (NOT incremental).
 *
 * Returns a discriminated union so callers can do exhaustive matching
 * without try/catch around expected error paths. The function only throws
 * on truly unexpected runtime errors (caller should catch and 500).
 */

import {
  scorePick,
  type MatchActual,
  type PickInput,
  type RoundCode,
} from './scoring.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface ScoreMatchOk {
  ok: true
  match_id: string
  scored_profiles: number
  cache_refreshed: number
  match: {
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

export interface ScoreMatchErr {
  ok: false
  error: string
  detail?: string
  /**
   * Suggested HTTP status code for the route wrapper.
   *   404 — match_id not found
   *   422 — match not finalized
   *   500 — unexpected DB error
   */
  status: 404 | 422 | 500
}

export type ScoreMatchResult = ScoreMatchOk | ScoreMatchErr

// ---------------------------------------------------------------------------
// DB row shapes
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

// ---------------------------------------------------------------------------
// Round-code → leaderboard cache column mapping
// `final` covers both the Final AND 3rd-place playoff (both share round_code).
// ---------------------------------------------------------------------------
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
    r1_pts: 0,
    r2_pts: 0,
    r3_pts: 0,
    r32_pts: 0,
    r16_pts: 0,
    qf_pts: 0,
    sf_pts: 0,
    final_pts: 0,
  }
}

// ---------------------------------------------------------------------------
// goalscorers jsonb shape parser
// ---------------------------------------------------------------------------
function parseGoalscorers(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (raw !== null && raw !== undefined) {
      console.warn('[score-match] goalscorers is not an array, ignoring:', typeof raw)
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
      if (typeof candidate === 'string') {
        ids.push(candidate)
      } else {
        console.warn('[score-match] unrecognized goalscorers entry shape:', Object.keys(obj))
      }
    } else {
      console.warn('[score-match] unrecognized goalscorers entry type:', typeof entry)
    }
  }
  return ids
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Score every user's pick for a single finalized match and refresh the
 * leaderboard cache for every profile this match touched.
 *
 * Behavior identical to legacy POST /api/predictor/score-match handler.
 *
 * @param matchId The predictor_matches.id (must already be trimmed).
 * @param client Optional Supabase client (for tests). Defaults to predictorAdmin().
 */
export async function scoreMatchById(
  matchId: string,
  client?: SupabaseClient,
): Promise<ScoreMatchResult> {
  console.log(`[score-match] start match_id=${matchId}`)

  // Lazy import so test runs (which inject `client`) never touch the real
  // supabase client init or its env-var requirements.
  let sb: SupabaseClient
  if (client) {
    sb = client
  } else {
    const { predictorAdmin } = await import('@/lib/predictor-db')
    sb = predictorAdmin()
  }

  // -- Load match -----------------------------------------------------------
  const { data: matchRow, error: matchErr } = await sb
    .from('predictor_matches')
    .select(
      'id, round_code, home_team_code, away_team_code, home_score, away_score, went_to_pks, pk_winner_team_code, goalscorers, status',
    )
    .eq('id', matchId)
    .maybeSingle()

  if (matchErr) {
    console.error('[score-match] match lookup error:', matchErr.message)
    return { ok: false, error: matchErr.message, status: 500 }
  }
  if (!matchRow) {
    return { ok: false, error: 'match_not_found', status: 404 }
  }

  const match = matchRow as PredictorMatchRow

  if (match.home_score === null || match.away_score === null) {
    return {
      ok: false,
      error: 'match_not_finalized',
      detail: 'home_score or away_score is null',
      status: 422,
    }
  }

  const scorerIds = parseGoalscorers(match.goalscorers)
  console.log(
    `[score-match] match loaded round=${match.round_code} score=${match.home_score}-${match.away_score} ` +
      `went_to_pks=${match.went_to_pks ?? false} pk_winner=${match.pk_winner_team_code} scorers=${scorerIds.length}`,
  )

  // -- Load picks ----------------------------------------------------------
  const { data: pickRows, error: picksErr } = await sb
    .from('predictor_picks')
    .select(
      'id, profile_id, match_id, home_score, away_score, if_draw_winner, pk_advance_team_id, is_star, goalscorer_player_id, goalscorer_team_code',
    )
    .eq('match_id', matchId)

  if (picksErr) {
    console.error('[score-match] picks load error:', picksErr.message)
    return { ok: false, error: picksErr.message, status: 500 }
  }

  const picks = (pickRows ?? []) as PredictorPickRow[]
  console.log(`[score-match] loaded ${picks.length} picks`)

  // -- Build MatchActual once ----------------------------------------------
  const actual: MatchActual = {
    home_score: match.home_score,
    away_score: match.away_score,
    went_to_pks: match.went_to_pks ?? false,
    // Lib types it as team_id; our schema stores team_code as the identifier.
    pk_winner_team_id: match.pk_winner_team_code ?? null,
    scorer_player_ids: scorerIds,
    round_code: match.round_code,
  }

  // -- Score every pick → predictor_scores rows ----------------------------
  const scoreInserts: PredictorScoreInsert[] = []
  const affectedProfileIds = new Set<string>()

  for (const p of picks) {
    const pickInput: PickInput = {
      home_score: p.home_score,
      away_score: p.away_score,
      scorer_player_ids: p.goalscorer_player_id ? [p.goalscorer_player_id] : [],
      // Canonical column with fallback to legacy if_draw_winner.
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

  console.log(
    `[score-match] computed ${scoreInserts.length} score rows for ${affectedProfileIds.size} profiles`,
  )

  // -- Upsert predictor_scores --------------------------------------------
  if (scoreInserts.length > 0) {
    const { error: upsertErr } = await sb
      .from('predictor_scores')
      .upsert(scoreInserts, {
        onConflict: 'profile_id,match_id',
        ignoreDuplicates: false,
      })

    if (upsertErr) {
      console.error('[score-match] predictor_scores upsert error:', upsertErr.message)
      return { ok: false, error: upsertErr.message, status: 500 }
    }
  }

  console.log(`[score-match] predictor_scores upserted`)

  // -- Refresh leaderboard cache per affected profile ----------------------
  // Strategy: for each affected profile, full re-sum of their predictor_scores
  // rows (NOT incremental). Idempotent, race-safe (same input → same output).
  let cacheRefreshed = 0
  if (affectedProfileIds.size > 0) {
    const profileIdList = Array.from(affectedProfileIds)

    const { data: allScores, error: scoresErr } = await sb
      .from('predictor_scores')
      .select('profile_id, match_id, total_pts, exact_pts')
      .in('profile_id', profileIdList)

    if (scoresErr) {
      console.error('[score-match] scores re-read error:', scoresErr.message)
      return { ok: false, error: scoresErr.message, status: 500 }
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
        console.error('[score-match] match round lookup error:', mErr.message)
        return { ok: false, error: mErr.message, status: 500 }
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
      if (round) {
        const col = ROUND_TO_CACHE_COL[round]
        agg.buckets[col] += total
      } else {
        console.warn(`[score-match] no round_code for match_id=${s.match_id}, skipping bucket`)
      }
    }

    const { data: existingCache, error: cacheReadErr } = await sb
      .from('predictor_leaderboard_cache')
      .select('profile_id, winner_pick_pts')
      .in('profile_id', profileIdList)

    if (cacheReadErr) {
      console.error('[score-match] cache read error:', cacheReadErr.message)
      return { ok: false, error: cacheReadErr.message, status: 500 }
    }
    const existingWinnerPts = new Map<string, number>()
    for (const row of existingCache ?? []) {
      existingWinnerPts.set(row.profile_id as string, (row.winner_pick_pts as number | null) ?? 0)
    }

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
        updated_at: new Date().toISOString(),
      }
    })

    const { error: cacheErr } = await sb
      .from('predictor_leaderboard_cache')
      .upsert(cacheUpserts, {
        onConflict: 'profile_id',
        ignoreDuplicates: false,
      })

    if (cacheErr) {
      console.error('[score-match] leaderboard cache upsert error:', cacheErr.message)
      return { ok: false, error: cacheErr.message, status: 500 }
    }

    cacheRefreshed = cacheUpserts.length
    console.log(`[score-match] refreshed ${cacheRefreshed} leaderboard cache rows`)
  }

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
}
