/**
 * POST /api/predictor/score-match
 *
 * Score every user's pick for a single finalized match, write per-pick
 * results into `predictor_scores`, and refresh `predictor_leaderboard_cache`
 * for every profile this match touched.
 *
 * Auth (Pass 1, mirrors /api/admin/bracket/recompute):
 *   Header `x-admin-key: <PREDICTOR_ADMIN_KEY>`.
 *   PREDICTOR_ADMIN_KEY is its OWN env var (not bracket's). Unset → 503.
 *
 * Body: { "match_id": "<text>" }
 *
 * Response 200:
 *   {
 *     ok: true,
 *     match_id,
 *     scored_profiles: <int>,   // # predictor_scores rows upserted
 *     cache_refreshed: <int>,   // # predictor_leaderboard_cache rows updated
 *     match: {
 *       round_code, home_team_code, away_team_code,
 *       home_score, away_score, went_to_pks, pk_winner_team_code,
 *       goalscorer_count
 *     }
 *   }
 *
 * Error codes:
 *   400 — missing/invalid body or match_id
 *   401 — bad x-admin-key
 *   404 — match_id not found
 *   422 — match not finalized (home_score or away_score is null)
 *   500 — unexpected DB error
 *   503 — PREDICTOR_ADMIN_KEY env var not configured
 *
 * Idempotency:
 *   Safe to re-run. predictor_scores upserts by (profile_id, match_id);
 *   leaderboard cache is fully re-summed per affected profile from
 *   predictor_scores (NOT incrementally added).
 *
 * Concurrency:
 *   Two concurrent calls for the SAME match_id are safe (upserts +
 *   full re-sum). Two concurrent calls for DIFFERENT matches that share
 *   profiles can race on the leaderboard cache row — last write wins,
 *   but because we full-resum from predictor_scores both writes converge
 *   to the same correct value. Acceptable for admin-triggered scoring.
 *
 * Known gaps (callers should be aware):
 *   - winner_pick_pts is NOT modified here. Awarding the +40 winner-pick
 *     bonus is a separate Wave (it's a once-per-tournament flow, not
 *     per-match). Existing cache values for winner_pick_pts are preserved
 *     on upsert by re-reading the current value first; new rows start at 0.
 *   - tiebreaker "correct results count" not yet cached.
 */

import { NextResponse } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'
import {
  scorePick,
  type MatchActual,
  type PickInput,
  type RoundCode,
} from '@/lib/predictor/scoring'
import { validateScoreMatchRequest } from './validate'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types matching DB schema
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
// goalscorers jsonb shape is one of:
//   - [uuid, uuid, ...]                           (plain id array)
//   - [{ player_id: uuid, ... }, ...]             (object form)
//   - [{ id: uuid, ... }, ...]                    (alt object form)
// Anything else → empty list + warn.
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
// Handler
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    // -- Auth + body validation --------------------------------------------
    const v = await validateScoreMatchRequest(request)
    if (!v.ok) {
      return NextResponse.json(v.body, { status: v.status })
    }
    const matchId = v.matchId

    console.log(`[score-match] start match_id=${matchId}`)

    const sb = predictorAdmin()

    // -- Load match ---------------------------------------------------------
    const { data: matchRow, error: matchErr } = await sb
      .from('predictor_matches')
      .select(
        'id, round_code, home_team_code, away_team_code, home_score, away_score, went_to_pks, pk_winner_team_code, goalscorers, status',
      )
      .eq('id', matchId)
      .maybeSingle()

    if (matchErr) {
      console.error('[score-match] match lookup error:', matchErr.message)
      return NextResponse.json({ ok: false, error: matchErr.message }, { status: 500 })
    }
    if (!matchRow) {
      return NextResponse.json({ ok: false, error: 'match_not_found' }, { status: 404 })
    }

    const match = matchRow as PredictorMatchRow

    if (match.home_score === null || match.away_score === null) {
      return NextResponse.json(
        { ok: false, error: 'match_not_finalized', detail: 'home_score or away_score is null' },
        { status: 422 },
      )
    }

    const scorerIds = parseGoalscorers(match.goalscorers)
    console.log(
      `[score-match] match loaded round=${match.round_code} score=${match.home_score}-${match.away_score} ` +
        `went_to_pks=${match.went_to_pks ?? false} pk_winner=${match.pk_winner_team_code} scorers=${scorerIds.length}`,
    )

    // -- Load picks ---------------------------------------------------------
    const { data: pickRows, error: picksErr } = await sb
      .from('predictor_picks')
      .select(
        'id, profile_id, match_id, home_score, away_score, if_draw_winner, pk_advance_team_id, is_star, goalscorer_player_id, goalscorer_team_code',
      )
      .eq('match_id', matchId)

    if (picksErr) {
      console.error('[score-match] picks load error:', picksErr.message)
      return NextResponse.json({ ok: false, error: picksErr.message }, { status: 500 })
    }

    const picks = (pickRows ?? []) as PredictorPickRow[]
    console.log(`[score-match] loaded ${picks.length} picks`)

    // -- Build MatchActual once --------------------------------------------
    const actual: MatchActual = {
      home_score: match.home_score,
      away_score: match.away_score,
      went_to_pks: match.went_to_pks ?? false,
      // Lib types it as team_id; our schema stores team_code as the identifier.
      pk_winner_team_id: match.pk_winner_team_code ?? null,
      scorer_player_ids: scorerIds,
      round_code: match.round_code,
    }

    // -- Score every pick → predictor_scores rows --------------------------
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

    console.log(`[score-match] computed ${scoreInserts.length} score rows for ${affectedProfileIds.size} profiles`)

    // -- Upsert predictor_scores -------------------------------------------
    if (scoreInserts.length > 0) {
      const { error: upsertErr } = await sb
        .from('predictor_scores')
        .upsert(scoreInserts, {
          onConflict: 'profile_id,match_id',
          ignoreDuplicates: false,
        })

      if (upsertErr) {
        console.error('[score-match] predictor_scores upsert error:', upsertErr.message)
        return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 })
      }
    }

    console.log(`[score-match] predictor_scores upserted`)

    // -- Refresh leaderboard cache per affected profile --------------------
    // Strategy: for each affected profile, full re-sum of their predictor_scores
    // rows (NOT incremental). Idempotent, race-safe (same input → same output).
    let cacheRefreshed = 0
    if (affectedProfileIds.size > 0) {
      const profileIdList = Array.from(affectedProfileIds)

      // Pull all score rows for these profiles in one query, then bucket
      // in memory by round_code. This avoids N+1 round trips.
      const { data: allScores, error: scoresErr } = await sb
        .from('predictor_scores')
        .select('profile_id, match_id, total_pts, exact_pts')
        .in('profile_id', profileIdList)

      if (scoresErr) {
        console.error('[score-match] scores re-read error:', scoresErr.message)
        return NextResponse.json({ ok: false, error: scoresErr.message }, { status: 500 })
      }

      // Pull every match_id referenced by these score rows so we can map
      // round_code. One query per match_id list (small relative to picks).
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
          return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })
        }
        for (const m of matchRows ?? []) {
          matchIdToRound.set(m.id as string, m.round_code as RoundCode)
        }
      }

      // Bucket sums per profile.
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
          console.warn(`[score-match] no round_code for match_id=${s.match_id}, skipping bucket`)        }
      }

      // Preserve any existing winner_pick_pts — read current cache rows first.
      const { data: existingCache, error: cacheReadErr } = await sb
        .from('predictor_leaderboard_cache')
        .select('profile_id, winner_pick_pts')
        .in('profile_id', profileIdList)

      if (cacheReadErr) {
        console.error('[score-match] cache read error:', cacheReadErr.message)
        return NextResponse.json({ ok: false, error: cacheReadErr.message }, { status: 500 })
      }
      const existingWinnerPts = new Map<string, number>()
      for (const row of existingCache ?? []) {
        existingWinnerPts.set(row.profile_id as string, (row.winner_pick_pts as number | null) ?? 0)
      }

      // Build upsert payload.
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
          // Preserve winner_pick_pts; default to 0 if no row yet.
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
        return NextResponse.json({ ok: false, error: cacheErr.message }, { status: 500 })
      }

      cacheRefreshed = cacheUpserts.length
      console.log(`[score-match] refreshed ${cacheRefreshed} leaderboard cache rows`)
    }

    return NextResponse.json({
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
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[score-match] unexpected error:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
