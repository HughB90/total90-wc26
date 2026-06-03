/**
 * WC26 Predictor — Scoring engine (v2 canonical)
 *
 * Pure function. No DB, no network, no clock.
 * Spec: docs/PREDICTOR-SCORING-RULES.md
 *
 * Per-match scoring (every round):
 *   - Exact score correct: 10 pts
 *   - Result correct (W/D/L), score wrong: 4 pts
 *   - Wrong: 0
 *
 * Modifiers:
 *   - Star (R1–R4 only): ×2 multiplier on total
 *   - Advancer-on-PKs (R4–R8): +3 if predicted draw + actual PKs + correct PK winner
 *   - Anytime goalscorer (R5–R8): +2 if picked player scored in 90+ET (not shootout),
 *                                  independent of result
 *
 * The function NEVER throws; bad input degrades to a zero/gray result.
 */

export type RoundCode =
  | 'group_r1'
  | 'group_r2'
  | 'group_r3'
  | 'r32'
  | 'r16'
  | 'qf'
  | 'sf'
  | 'final';

export interface MatchActual {
  /** Home score at end of 90+ET, before any PK shootout. */
  home_score: number;
  /** Away score at end of 90+ET, before any PK shootout. */
  away_score: number;
  /** Whether the match was decided by a penalty shootout. */
  went_to_pks: boolean;
  /** Team id that won the shootout. Null unless went_to_pks. */
  pk_winner_team_id: string | null;
  /** Player ids who scored in open play or ET. EXCLUDES shootout goals. */
  scorer_player_ids: string[];
  round_code: RoundCode;
}

export interface PickInput {
  home_score: number | null;
  away_score: number | null;
  /** May be empty. For R5–R8 typically a single id. */
  scorer_player_ids: string[];
  /** Required for PK-advance bonus when predicted scoreline is a draw. */
  pk_advance_team_id: string | null;
  is_star: boolean;
  /** Resolves predicted winner. */
  home_team_id: string;
  /** Resolves predicted winner. */
  away_team_id: string;
}

export interface ScoreBreakdown {
  exact_pts: number;
  result_pts: number;
  scorer_pts: number;
  advancer_pk_pts: number;
  star_multiplier: 1 | 2;
  total_pts: number;
  outcome_color: 'teal' | 'green' | 'red' | 'gray';
}

const ROUNDS_WITH_STAR = new Set<RoundCode>([
  'group_r1',
  'group_r2',
  'group_r3',
  'r32',
]);

const ROUNDS_WITH_GOALSCORER = new Set<RoundCode>([
  'r16',
  'qf',
  'sf',
  'final',
]);

const ROUNDS_WITH_PK_BONUS = new Set<RoundCode>([
  'r32',
  'r16',
  'qf',
  'sf',
  'final',
]);

const ZERO_GRAY: ScoreBreakdown = {
  exact_pts: 0,
  result_pts: 0,
  scorer_pts: 0,
  advancer_pk_pts: 0,
  star_multiplier: 1,
  total_pts: 0,
  outcome_color: 'gray',
};

/**
 * Score a single pick against an actual match result.
 *
 * @param pick    The user's pick, or null if they didn't submit one.
 * @param actual  The actual match outcome.
 * @returns       A full score breakdown. Never throws.
 */
export function scorePick(
  pick: PickInput | null,
  actual: MatchActual,
): ScoreBreakdown {
  // No pick or incomplete pick → gray.
  if (
    pick === null ||
    pick.home_score === null ||
    pick.away_score === null
  ) {
    return { ...ZERO_GRAY };
  }

  const round = actual.round_code;

  // ---------------------------------------------------------------------
  // Exact / result
  // ---------------------------------------------------------------------
  const predictedDraw = pick.home_score === pick.away_score;
  const actualDraw90 = actual.home_score === actual.away_score;

  const exactMatch =
    pick.home_score === actual.home_score &&
    pick.away_score === actual.away_score;

  // Resolve predicted winner team id.
  //
  // Normal case: higher predicted score wins.
  // Predicted draw on a knockout (R4–R8) WITH a pk_advance_team_id pick: the
  // user has committed to that team as their winner-of-match. Per the spec's
  // worked Example 2 ("Pred 1-1 + Brazil on PKs, actual Brazil 2-1 ET → 4"),
  // we honor that team as the predicted winner for result_pts purposes.
  //
  // Predicted draw on a group match (R1–R3): always 'draw' — no pk_advance.
  // Predicted draw on a knockout WITHOUT pk_advance_team_id: treated as draw
  //   (impossible to be "right" since knockouts always have a winner; will
  //    yield result_pts = 0).
  let predictedWinnerTeamId: string | null;
  if (predictedDraw) {
    if (ROUNDS_WITH_PK_BONUS.has(round) && pick.pk_advance_team_id !== null) {
      predictedWinnerTeamId = pick.pk_advance_team_id;
    } else {
      predictedWinnerTeamId = null; // genuine draw prediction
    }
  } else {
    predictedWinnerTeamId =
      pick.home_score > pick.away_score
        ? pick.home_team_id
        : pick.away_team_id;
  }

  // Resolve actual advancer team id.
  // - If went to PKs, the PK winner advances.
  // - Else, higher 90+ET score advances; if draw with no PKs (group stage),
  //   "advancer" is null = group draw.
  let actualAdvancerTeamId: string | null;
  if (actual.went_to_pks) {
    actualAdvancerTeamId = actual.pk_winner_team_id;
  } else if (actualDraw90) {
    actualAdvancerTeamId = null; // group draw
  } else {
    // We don't have home_team_id / away_team_id on MatchActual; we can still
    // detect "who won" by comparing scores against the pick's team ids,
    // since both sides share the same home/away orientation per match.
    actualAdvancerTeamId =
      actual.home_score > actual.away_score
        ? pick.home_team_id
        : pick.away_team_id;
  }

  // Result match logic:
  //   predictedWinnerTeamId is now resolved with knockout-draw-with-PK-pick
  //   in mind. So:
  //   - both null → predicted group draw + actual group draw → result match
  //   - both non-null and equal → result match
  //   - else → mismatch
  //
  // BUT: if user predicted a draw AND the match went to PKs, their advance
  // credit is awarded EXCLUSIVELY via advancer_pk_pts (+3) — we do NOT also
  // give result_pts (+4) for matching the PK winner. This keeps Example 3
  // (pred 1-1 + BRA PK, actual 1-1 + BRA PKs → 13) and the spec's R32
  // "PK-advance correct alone → 3/green" case consistent.
  //
  // If user predicted a non-draw and the match went to PKs (Example 1:
  // pred Brazil 2-1, actual Brazil PKs win), they still get result_pts.
  // If user predicted a draw and the match did NOT go to PKs (Example 2:
  // pred 1-1 + BRA PK, actual Brazil 2-1 ET), they still get result_pts.
  const drawAndWentToPks = predictedDraw && actual.went_to_pks;
  const resultMatch =
    !drawAndWentToPks && predictedWinnerTeamId === actualAdvancerTeamId;

  const exact_pts = exactMatch ? 10 : 0;
  const result_pts = !exactMatch && resultMatch ? 4 : 0;

  // ---------------------------------------------------------------------
  // Advancer-on-PKs (+3)
  //   - round must be R4–R8 (r32, r16, qf, sf, final)
  //   - predicted scoreline must be a draw
  //   - match must have gone to PKs
  //   - pk_advance_team_id must match actual.pk_winner_team_id
  // ---------------------------------------------------------------------
  let advancer_pk_pts = 0;
  if (
    ROUNDS_WITH_PK_BONUS.has(round) &&
    predictedDraw &&
    actual.went_to_pks &&
    pick.pk_advance_team_id !== null &&
    actual.pk_winner_team_id !== null &&
    pick.pk_advance_team_id === actual.pk_winner_team_id
  ) {
    advancer_pk_pts = 3;
  }

  // ---------------------------------------------------------------------
  // Anytime goalscorer (+2)
  //   - round must be R5–R8 (r16, qf, sf, final)
  //   - pick must have a scorer id
  //   - that id must appear in actual.scorer_player_ids
  //   - cap of one pick per match → scorer_pts is 0 or 2
  //   - independent of result
  // ---------------------------------------------------------------------
  let scorer_pts = 0;
  if (
    ROUNDS_WITH_GOALSCORER.has(round) &&
    pick.scorer_player_ids.length > 0
  ) {
    const actualSet = new Set(actual.scorer_player_ids);
    // Only consider the first pick (one per match). If caller passes more,
    // we still cap at +2 by using `some`.
    const anyHit = pick.scorer_player_ids.some((id) => actualSet.has(id));
    if (anyHit) scorer_pts = 2;
  }

  // ---------------------------------------------------------------------
  // Star multiplier
  //   - Only honored if is_star AND round is R1–R4
  //   - R5–R8 → forced 1 even if is_star
  // ---------------------------------------------------------------------
  const star_multiplier: 1 | 2 =
    pick.is_star && ROUNDS_WITH_STAR.has(round) ? 2 : 1;

  const baseSum = exact_pts + result_pts + scorer_pts + advancer_pk_pts;
  const total_pts = baseSum * star_multiplier;

  // ---------------------------------------------------------------------
  // outcome_color (mirrors DB generated column)
  //   - teal  : exact_pts > 0
  //   - green : any other positive component
  //   - red   : all zero (pick exists but scored nothing)
  // ---------------------------------------------------------------------
  let outcome_color: ScoreBreakdown['outcome_color'];
  if (exact_pts > 0) {
    outcome_color = 'teal';
  } else if (result_pts > 0 || advancer_pk_pts > 0 || scorer_pts > 0) {
    outcome_color = 'green';
  } else {
    outcome_color = 'red';
  }

  return {
    exact_pts,
    result_pts,
    scorer_pts,
    advancer_pk_pts,
    star_multiplier,
    total_pts,
    outcome_color,
  };
}
