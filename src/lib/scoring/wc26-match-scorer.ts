/**
 * WC 2026 match scorer.
 *
 * Given an Opta fixture ID:
 *   1. Pull MA2 (per-player stats) from Opta
 *   2. For each player: lookup position from `players` table
 *   3. Score with v1.4 controller
 *   4. Upsert into `wc26_matches` on conflict (opta_id, round)
 *
 * Idempotent: if a row already exists with scoring_version='v1.4' and the same
 * fantasy_points (±0.01), skip unless force=true.
 *
 * Schema requirements (from parallel `schema-split` subagent):
 *   - players: opta_id (text/uuid), position (text), name fields
 *   - wc26_matches: opta_id, round, fixture_id, opponent_nation, team_score,
 *                   opponent_score, result, minutes, goals, assists,
 *                   second_assists, shots, shots_on_target, key_passes,
 *                   big_chances_created, tackles, interceptions, blocks,
 *                   clearances, saves, clean_sheet, yellow_cards, red_cards,
 *                   own_goals, penalty_won, penalty_conceded, xg, xa,
 *                   raw_stats (jsonb), fantasy_points, scoring_version,
 *                   played_at
 *                   UNIQUE(opta_id, round)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getMatchStats,
  getOptaToken,
  determineRound,
  type OptaMatchStatsResponse,
  type WC26Round,
} from '../opta/match-stats';
import {
  computeFantasyPoints,
  getPosType,
  type Position,
} from '../t90-scoring/v1-4';

export interface ScoreMatchResult {
  scored: number;
  skipped: number;
  errors: string[];
  fixtureId: string;
  round?: WC26Round;
  tableMissing?: boolean;
}

// ---------- Supabase client ----------
function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------- Opta stat extraction ----------
/**
 * Convert a player's `stat[]` array from Opta into a flat
 * {endpoint: numeric value} map. String values are coerced to numbers.
 */
function statsArrayToMap(
  arr: Array<{ type: string; value: string | number }> | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!arr) return out;
  for (const s of arr) {
    if (!s || !s.type) continue;
    const v = typeof s.value === 'number' ? s.value : parseFloat(String(s.value));
    out[s.type] = isNaN(v) ? 0 : v;
  }
  return out;
}

// ---------- Aggregate match-level columns from raw stats ----------
function extractMatchColumns(stats: Record<string, number>) {
  const goals = stats.goals || 0;
  const assists = stats.goalAssist || 0;
  const secondAssists = stats.secondGoalAssist || 0;
  const shotsOnTarget = stats.ontargetScoringAtt || 0;
  const shotsOffTarget = stats.shotOffTarget || 0;
  const shots = shotsOnTarget + shotsOffTarget;
  const keyPasses = stats.totalAttAssist || 0;
  const bigChancesCreated = stats.bigChanceCreated || 0;
  const tackles = stats.totalTackle || 0;
  const interceptions = stats.interceptionWon || 0;
  const blocks = stats.blockedScoringAtt || 0;
  const clearances = stats.effectiveClearance ?? stats.totalClearance ?? 0;
  const saves = stats.saves || 0;
  const yellowCards = (stats.yellowCard || 0) + (stats.secondYellow || 0);
  const redCards = stats.redCard || 0;
  const ownGoals = stats.ownGoals || 0;
  const penaltyWon = stats.penaltyWon || 0;
  const penaltyConceded = stats.penaltyConceded || 0;
  const xg = stats.expectedGoals ?? 0;
  const xa = stats.expectedAssists ?? 0;
  const minutes = stats.minsPlayed || 0;

  return {
    minutes,
    goals,
    assists,
    second_assists: secondAssists,
    shots,
    shots_on_target: shotsOnTarget,
    key_passes: keyPasses,
    big_chances_created: bigChancesCreated,
    tackles,
    interceptions,
    blocks,
    clearances,
    saves,
    yellow_cards: yellowCards,
    red_cards: redCards,
    own_goals: ownGoals,
    penalty_won: penaltyWon,
    penalty_conceded: penaltyConceded,
    xg,
    xa,
  };
}

function nearlyEqual(a: number | null | undefined, b: number, eps = 0.01): boolean {
  if (a == null) return false;
  return Math.abs(a - b) <= eps;
}

// ---------- Player position lookup (batched) ----------
interface PlayerRow {
  opta_id: string;
  position: string | null;
}

async function lookupPositions(
  supabase: SupabaseClient,
  optaIds: string[]
): Promise<Map<string, Position | null>> {
  const out = new Map<string, Position | null>();
  if (optaIds.length === 0) return out;

  // Batch query — try `players` table first
  const { data, error } = await supabase
    .from('players')
    .select('opta_id, position')
    .in('opta_id', optaIds);

  if (error) {
    // Table might not exist yet (parallel migration). Fall back to null for all.
    return out;
  }

  for (const row of (data as PlayerRow[]) || []) {
    if (row.opta_id) {
      out.set(row.opta_id, row.position ? getPosType(row.position) : null);
    }
  }
  return out;
}

// ---------- Main scoreMatch ----------
export async function scoreMatch(
  fixtureId: string,
  opts: { force?: boolean } = {}
): Promise<ScoreMatchResult> {
  const force = opts.force === true;
  const result: ScoreMatchResult = {
    scored: 0,
    skipped: 0,
    errors: [],
    fixtureId,
  };

  // 1. Get Opta token + match stats
  const token = await getOptaToken();
  const ms = await getMatchStats(token, fixtureId);
  if (!ms.matchInfo) {
    result.errors.push(`fixture ${fixtureId}: matchstats missing matchInfo`);
    return result;
  }

  // 2. Determine round
  let round: WC26Round;
  try {
    round = determineRound(ms);
    result.round = round;
  } catch (e) {
    result.errors.push(`fixture ${fixtureId}: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  // 3. Get match-level context
  const mi = ms.matchInfo;
  const contestants = mi.contestant || [];
  const home = contestants.find(c => c.position === 'home') || contestants[0];
  const away = contestants.find(c => c.position === 'away') || contestants[1];
  const scores = ms.liveData?.matchDetails?.scores;
  const ftHome = scores?.ft?.home ?? scores?.et?.home ?? scores?.total?.home ?? null;
  const ftAway = scores?.ft?.away ?? scores?.et?.away ?? scores?.total?.away ?? null;
  const playedAt = mi.date
    ? `${mi.date}${mi.time ? `T${mi.time}` : ''}`
    : null;

  const lineUps = ms.liveData?.lineUp || [];

  // 4. Collect all player opta IDs for position lookup
  const allPlayerIds: string[] = [];
  for (const team of lineUps) {
    for (const p of team.player || []) {
      if (p.playerId) allPlayerIds.push(p.playerId);
    }
  }

  // 5. Supabase admin client
  let supabase: SupabaseClient | null = null;
  let positionMap = new Map<string, Position | null>();
  let tableMissing = false;
  try {
    supabase = getServiceClient();
    positionMap = await lookupPositions(supabase, allPlayerIds);
  } catch (e) {
    result.errors.push(
      `Supabase init failed (positions will default to Opta position string): ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // 6. Process each player
  const upsertRows: Array<Record<string, unknown>> = [];

  for (const team of lineUps) {
    const teamId = team.contestantId;
    const isHome = !!home && teamId === home.id;
    const opponentNation = isHome ? away?.name || '' : home?.name || '';
    const teamScore = isHome ? ftHome : ftAway;
    const oppScore = isHome ? ftAway : ftHome;
    let resultLetter: 'W' | 'L' | 'D' | null = null;
    if (teamScore != null && oppScore != null) {
      resultLetter = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'D';
    }

    for (const p of team.player || []) {
      if (!p.playerId) continue;
      const statsMap = statsArrayToMap(p.stat);

      // Determine position: prefer DB lookup, fall back to Opta string
      const dbPos = positionMap.get(p.playerId);
      const position: Position = dbPos ?? getPosType(p.position || p.positionSide || '');

      // Compute fantasy points
      const { total, breakdown, scoringVersion } = computeFantasyPoints(statsMap, position);

      // Match-level columns
      const cols = extractMatchColumns(statsMap);
      const cleanSheet =
        (position === 'DEF' || position === 'GK') &&
        cols.minutes >= 45 &&
        (statsMap.goalsConceded || 0) === 0;

      const rawStats = {
        ...statsMap,
        scoring_breakdown: breakdown,
        position_used: position,
      };

      upsertRows.push({
        opta_id: p.playerId,
        round,
        fixture_id: fixtureId,
        opponent_nation: opponentNation,
        team_score: teamScore,
        opponent_score: oppScore,
        result: resultLetter,
        ...cols,
        clean_sheet: cleanSheet,
        raw_stats: rawStats,
        fantasy_points: total,
        scoring_version: scoringVersion,
        played_at: playedAt,
      });
    }
  }

  if (upsertRows.length === 0) {
    result.errors.push(`fixture ${fixtureId}: no player rows in MA2 response`);
    return result;
  }

  // 7. Upsert (unless table is missing or supabase init failed)
  if (!supabase) {
    return result;
  }

  // Idempotency check: only when not forcing
  if (!force) {
    const optaIds = upsertRows.map(r => r.opta_id as string);
    const { data: existing, error: exErr } = await supabase
      .from('wc26_matches')
      .select('opta_id, fantasy_points, scoring_version')
      .eq('round', round)
      .in('opta_id', optaIds);

    if (exErr) {
      const msg = (exErr.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('not find the table')) {
        tableMissing = true;
        result.tableMissing = true;
        result.errors.push(
          `wc26_matches table not yet created (parallel migration pending) — skipping ${upsertRows.length} writes`
        );
        return result;
      }
      result.errors.push(`existence check failed: ${exErr.message}`);
    } else if (existing) {
      const existingByOpta = new Map<string, { fp: number | null; v: string | null }>();
      for (const row of existing as Array<{ opta_id: string; fantasy_points: number | null; scoring_version: string | null }>) {
        existingByOpta.set(row.opta_id, { fp: row.fantasy_points, v: row.scoring_version });
      }
      const filtered: typeof upsertRows = [];
      for (const r of upsertRows) {
        const ex = existingByOpta.get(r.opta_id as string);
        if (ex && ex.v === 'v1.4' && nearlyEqual(ex.fp, r.fantasy_points as number)) {
          result.skipped++;
          continue;
        }
        filtered.push(r);
      }
      if (filtered.length === 0) return result;
      upsertRows.splice(0, upsertRows.length, ...filtered);
    }
  }

  if (tableMissing) return result;

  // Upsert on (opta_id, round)
  const { error: upErr } = await supabase
    .from('wc26_matches')
    .upsert(upsertRows, { onConflict: 'opta_id,round' });

  if (upErr) {
    const msg = (upErr.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('not find the table')) {
      result.tableMissing = true;
      result.errors.push(
        `wc26_matches table not yet created (parallel migration pending) — skipping ${upsertRows.length} writes`
      );
      return result;
    }
    result.errors.push(`upsert failed: ${upErr.message}`);
    return result;
  }

  result.scored = upsertRows.length;
  return result;
}
