/**
 * WC26 Predictor — Scoring engine (v2 canonical, bundled-pick model)
 *
 * Pure function. No DB, no network, no clock.
 * Spec: docs/PREDICTOR-SCORING-RULES.md
 *
 * Mental model:
 *   Group stage (R1–R3): standard 3-way W/D/L. Scoreline alone determines
 *                        both exact and result.
 *
 *   Knockouts (R4–R8):   a predicted DRAW scoreline (e.g. 1-1) is a bundled
 *                        prediction meaning "this match goes to PKs and
 *                        `pk_advance_team_id` wins the shootout." There is
 *                        NO separate +3 PK bonus — the PK side is folded
 *                        into exact (10) and result (4) point types.
 *
 *                        - Exact requires the 90+ET scoreline to match AND:
 *                          • predicted draw → went_to_pks must be true AND
 *                            pk_advance_team_id must match pk_winner_team_id
 *                          • predicted non-draw → went_to_pks must be false
 *                            (predicting a non-draw = "decided in 90 or ET")
 *
 *                        - Result requires the predicted advancer to match
 *                          the actual advancer. Predicted advancer is the
 *                          higher-score side for non-draw picks, or
 *                          pk_advance_team_id for draw picks. Actual
 *                          advancer is pk_winner_team_id if went_to_pks,
 *                          else the higher-score side.
 *
 * Per-match scoring (every round):
 *   - Exact score correct:        10 pts
 *   - Result correct, score wrong: 4 pts
 *   - Wrong:                       0
 *
 * Modifiers:
 *   - Star (R1–R4 only): ×2 multiplier on total
 *   - Anytime goalscorer (R5–R8): +2 if picked player scored in 90+ET
 *                                  (not shootout), independent of result
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
  /**
   * Bundled with a predicted draw scoreline in knockouts: "this match goes
   * to PKs and this team wins the shootout." Required for the draw pick to
   * be valid in knockouts. Ignored if predicted scoreline is non-draw.
   */
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

/** Knockout rounds (R4–R8). */
const KNOCKOUT_ROUNDS = new Set<RoundCode>([
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
  star_multiplier: 1,
  total_pts: 0,
  outcome_color: 'gray',
};

/**
 * Resolve predicted vs actual advancer in a knockout match.
 *
 * - Predicted advancer:
 *   • non-draw pick → higher-score side's team_id
 *   • draw pick → pk_advance_team_id (may be null → invalid pick)
 *
 * - Actual advancer:
 *   • went_to_pks → pk_winner_team_id
 *   • else → higher-score side's team_id
 *
 * Returns null in either slot when undetermined.
 */
function resolveKnockoutAdvancers(
  pick: PickInput,
  actual: MatchActual,
): { predicted: string | null; actual: string | null } {
  const predictedDraw = pick.home_score === pick.away_score;

  let predicted: string | null;
  if (predictedDraw) {
    predicted = pick.pk_advance_team_id; // null → invalid pick for result
  } else {
    predicted =
      (pick.home_score as number) > (pick.away_score as number)
        ? pick.home_team_id
        : pick.away_team_id;
  }

  let actualAdvancer: string | null;
  if (actual.went_to_pks) {
    actualAdvancer = actual.pk_winner_team_id;
  } else if (actual.home_score === actual.away_score) {
    // Knockouts shouldn't end level without PKs; defensive null.
    actualAdvancer = null;
  } else {
    actualAdvancer =
      actual.home_score > actual.away_score
        ? pick.home_team_id
        : pick.away_team_id;
  }

  return { predicted, actual: actualAdvancer };
}

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
  const isKnockout = KNOCKOUT_ROUNDS.has(round);
  const predictedDraw = pick.home_score === pick.away_score;

  const scorelineMatch =
    pick.home_score === actual.home_score &&
    pick.away_score === actual.away_score;

  // ---------------------------------------------------------------------
  // Exact (10)
  // ---------------------------------------------------------------------
  let exact_pts = 0;
  if (scorelineMatch) {
    if (!isKnockout) {
      // Group: scoreline match is enough.
      exact_pts = 10;
    } else if (predictedDraw) {
      // Knockout + draw pick: the bundled prediction is "PKs, X wins."
      // Exact requires the match to actually go to PKs AND the PK winner
      // to match the user's pk_advance_team_id pick.
      if (
        actual.went_to_pks &&
        pick.pk_advance_team_id !== null &&
        actual.pk_winner_team_id !== null &&
        pick.pk_advance_team_id === actual.pk_winner_team_id
      ) {
        exact_pts = 10;
      }
    } else {
      // Knockout + non-draw pick: predicting non-draw means "decided in
      // 90 or ET." Exact requires the match to NOT have gone to PKs.
      if (!actual.went_to_pks) {
        exact_pts = 10;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Result (4)
  // ---------------------------------------------------------------------
  let result_pts = 0;
  if (exact_pts === 0) {
    if (!isKnockout) {
      // Group: compare W/D/L sides.
      const predSign = Math.sign(pick.home_score - pick.away_score);
      const actSign = Math.sign(actual.home_score - actual.away_score);
      if (predSign === actSign) {
        result_pts = 4;
      }
    } else {
      // Knockout: compare advancers.
      const { predicted, actual: actualAdvancer } = resolveKnockoutAdvancers(
        pick,
        actual,
      );
      if (predicted !== null && actualAdvancer !== null && predicted === actualAdvancer) {
        result_pts = 4;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Anytime goalscorer (+2)
  //   - round must be R5–R8 (r16, qf, sf, final)
  //   - pick must have a scorer id
  //   - that id must appear in actual.scorer_player_ids
  //   - independent of result
  // ---------------------------------------------------------------------
  let scorer_pts = 0;
  if (
    ROUNDS_WITH_GOALSCORER.has(round) &&
    pick.scorer_player_ids.length > 0
  ) {
    const actualSet = new Set(actual.scorer_player_ids);
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

  const total_pts = (exact_pts + result_pts + scorer_pts) * star_multiplier;

  // ---------------------------------------------------------------------
  // outcome_color
  //   - teal  : exact_pts > 0
  //   - green : result_pts > 0 OR scorer_pts > 0
  //   - red   : pick exists, scored nothing
  //   - gray  : no pick (handled above)
  // ---------------------------------------------------------------------
  let outcome_color: ScoreBreakdown['outcome_color'];
  if (exact_pts > 0) {
    outcome_color = 'teal';
  } else if (result_pts > 0 || scorer_pts > 0) {
    outcome_color = 'green';
  } else {
    outcome_color = 'red';
  }

  return {
    exact_pts,
    result_pts,
    scorer_pts,
    star_multiplier,
    total_pts,
    outcome_color,
  };
}
