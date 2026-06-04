/**
 * Tests for WC26 Predictor scoring engine (v2, bundled-pick model).
 *
 * Run with:
 *   node --experimental-strip-types --test src/lib/predictor/scoring.test.ts
 *
 * Uses Node 26's built-in test runner. No external deps.
 *
 * Worked examples E-G1..E-K12 are taken verbatim from
 * docs/PREDICTOR-SCORING-RULES.md.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scorePick,
  type MatchActual,
  type PickInput,
  type RoundCode,
} from './scoring.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BRA = 'BRA';
const ARG = 'ARG';
const FRA = 'FRA';
const GER = 'GER';

function pick(over: Partial<PickInput> = {}): PickInput {
  return {
    home_score: 0,
    away_score: 0,
    scorer_player_ids: [],
    pk_advance_team_id: null,
    is_star: false,
    home_team_id: BRA,
    away_team_id: ARG,
    ...over,
  };
}

function actual(over: Partial<MatchActual> = {}): MatchActual {
  return {
    home_score: 0,
    away_score: 0,
    went_to_pks: false,
    pk_winner_team_id: null,
    scorer_player_ids: [],
    round_code: 'group_r1',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Worked examples — Group stage (E-G1..E-G5)
// ---------------------------------------------------------------------------
describe('worked examples — group stage', () => {
  it('E-G1: Pred 2-1, Actual 2-1 → exact (10) → 10/teal', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1 }),
      actual({ home_score: 2, away_score: 1, round_code: 'group_r1' }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('E-G2: Pred 2-1, Actual 3-1 → result (4) → 4/green', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1 }),
      actual({ home_score: 3, away_score: 1, round_code: 'group_r1' }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 4);
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('E-G3: Pred 1-1, Actual 1-1 → exact (10) → 10/teal', () => {
    const s = scorePick(
      pick({ home_score: 1, away_score: 1 }),
      actual({ home_score: 1, away_score: 1, round_code: 'group_r2' }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('E-G4: Pred 1-1, Actual 2-2 → result (4) → 4/green (draw vs draw)', () => {
    const s = scorePick(
      pick({ home_score: 1, away_score: 1 }),
      actual({ home_score: 2, away_score: 2, round_code: 'group_r2' }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 4);
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('E-G5: Pred 2-1, Actual 1-2 → 0/red', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1 }),
      actual({ home_score: 1, away_score: 2, round_code: 'group_r3' }),
    );
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });
});

// ---------------------------------------------------------------------------
// Worked examples — Knockouts, non-draw predictions (E-K1..E-K5)
// ---------------------------------------------------------------------------
describe('worked examples — knockouts, non-draw predictions', () => {
  it('E-K1: Pred Brazil 2-1, actual Brazil 2-1 in regulation → exact (10) → 10/teal', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('E-K2: Pred Brazil 2-1, actual Brazil 3-1 in regulation → result (4) → 4/green', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 3,
        away_score: 1,
        went_to_pks: false,
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 4);
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('E-K3: Pred Brazil 2-1, actual Brazil wins on PKs after 1-1 → result (4) → 4/green', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'qf',
      }),
    );
    assert.equal(s.exact_pts, 0); // predicted non-draw but match went to PKs
    assert.equal(s.result_pts, 4); // Brazil advanced as predicted
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('E-K4: Pred Brazil 2-1, actual France 2-1 in regulation → 0/red', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 2,
        went_to_pks: false,
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });

  it('E-K5: Pred Brazil 2-1, actual France wins on PKs after 1-1 → 0/red', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: FRA,
        round_code: 'sf',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });
});

// ---------------------------------------------------------------------------
// Worked examples — Knockouts, predicted-draw + PK-advance (E-K6..E-K12)
// ---------------------------------------------------------------------------
describe('worked examples — knockouts, predicted draw + PK pick', () => {
  it('E-K6: Pred 1-1 + Brazil PK, actual 1-1 then Brazil PK → exact (10) → 10/teal', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'qf',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('E-K7: Pred 1-1 + Brazil PK, actual 0-0 then Brazil PK → result (4) → 4/green', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 0,
        away_score: 0,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 4);
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('E-K8: Pred 1-1 + Brazil PK, actual Brazil 2-1 in ET → result (4) → 4/green', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 4); // Brazil advanced as predicted via pk_advance pick
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('E-K9: Pred 1-1 + Brazil PK, actual 1-1 then France PK → 0/red (wrong advancer)', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: FRA,
        round_code: 'qf',
      }),
    );
    assert.equal(s.exact_pts, 0); // scoreline matches but PK winner doesn't match pick
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });

  it('E-K10: Pred 1-1 + Brazil PK, actual France 2-1 in ET → 0/red', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 2,
        went_to_pks: false,
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });

  it('E-K11: Pred 0-0 + Brazil PK, actual 0-0 then Brazil PK → exact (10) → 10/teal', () => {
    const s = scorePick(
      pick({
        home_score: 0,
        away_score: 0,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 0,
        away_score: 0,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'sf',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('E-K12: Pred draw with pk_advance_team_id=null in knockout → 0/red', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: null, // invalid: no PK side committed
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'r32',
      }),
    );
    // Scoreline matches but pk_advance pick missing → exact denied.
    // Resolver returns null predicted advancer → no result.
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });
});

// ---------------------------------------------------------------------------
// Star multiplier
// ---------------------------------------------------------------------------
describe('star multiplier', () => {
  it('star × exact in R1 → 20/teal', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1, is_star: true }),
      actual({ home_score: 2, away_score: 1, round_code: 'group_r1' }),
    );
    assert.equal(s.star_multiplier, 2);
    assert.equal(s.exact_pts, 10);
    assert.equal(s.total_pts, 20);
    assert.equal(s.outcome_color, 'teal');
  });

  it('star × wrong in R1 → 0/red (0 × 2 = 0)', () => {
    const s = scorePick(
      pick({ home_score: 3, away_score: 0, is_star: true }),
      actual({ home_score: 0, away_score: 2, round_code: 'group_r1' }),
    );
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });

  it('star honored in R4 (r32) → 20/teal', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        is_star: true,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        round_code: 'r32',
      }),
    );
    assert.equal(s.star_multiplier, 2);
    assert.equal(s.total_pts, 20);
  });

  it('star × result-only in R2 → 8/green', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1, is_star: true }),
      actual({ home_score: 3, away_score: 1, round_code: 'group_r2' }),
    );
    assert.equal(s.star_multiplier, 2);
    assert.equal(s.result_pts, 4);
    assert.equal(s.total_pts, 8);
    assert.equal(s.outcome_color, 'green');
  });

  it('star IGNORED in R5 (r16) — multiplier forced to 1', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1, is_star: true }),
      actual({ home_score: 2, away_score: 1, round_code: 'r16' }),
    );
    assert.equal(s.star_multiplier, 1);
    assert.equal(s.total_pts, 10); // exact only, not doubled
  });

  it('star IGNORED in R8 (final) — multiplier forced to 1', () => {
    const s = scorePick(
      pick({
        home_score: 3,
        away_score: 2,
        is_star: true,
        home_team_id: FRA,
        away_team_id: GER,
      }),
      actual({
        home_score: 3,
        away_score: 2,
        went_to_pks: false,
        round_code: 'final',
      }),
    );
    assert.equal(s.star_multiplier, 1);
    assert.equal(s.total_pts, 10);
  });
});

// ---------------------------------------------------------------------------
// Anytime goalscorer (R5–R8 only, independent of result)
// ---------------------------------------------------------------------------
describe('anytime goalscorer', () => {
  const PLAYER_A = 'player-a-uuid';
  const PLAYER_B = 'player-b-uuid';

  it('R16: goalscorer correct, result wrong → 2/green (independent of result)', () => {
    const s = scorePick(
      pick({
        home_score: 3,
        away_score: 0,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 0,
        away_score: 2,
        went_to_pks: false,
        scorer_player_ids: [PLAYER_A, PLAYER_B],
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 0);
    assert.equal(s.scorer_pts, 2);
    assert.equal(s.total_pts, 2);
    assert.equal(s.outcome_color, 'green');
  });

  it('R16: goalscorer correct + result correct → 6/green', () => {
    const s = scorePick(
      pick({
        home_score: 3,
        away_score: 0,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        scorer_player_ids: [PLAYER_A],
        round_code: 'r16',
      }),
    );
    assert.equal(s.result_pts, 4);
    assert.equal(s.scorer_pts, 2);
    assert.equal(s.total_pts, 6);
    assert.equal(s.outcome_color, 'green');
  });

  it('R16: goalscorer correct + exact → 12/teal', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        scorer_player_ids: [PLAYER_A, PLAYER_B],
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 2);
    assert.equal(s.total_pts, 12);
    assert.equal(s.outcome_color, 'teal');
  });

  it('R16: goalscorer wrong, exact correct → 10/teal (no scorer pts)', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        scorer_player_ids: [PLAYER_B], // not A
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 0);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('R16: empty scorer_player_ids → scorer_pts 0', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [],
      }),
      actual({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        round_code: 'r16',
      }),
    );
    assert.equal(s.scorer_pts, 0);
    assert.equal(s.total_pts, 10);
  });

  it('R8 final: goalscorer + exact → 12/teal (star ignored)', () => {
    const s = scorePick(
      pick({
        home_score: 3,
        away_score: 2,
        scorer_player_ids: ['p-final'],
        is_star: true, // ignored in R8
        home_team_id: FRA,
        away_team_id: GER,
      }),
      actual({
        home_score: 3,
        away_score: 2,
        went_to_pks: false,
        scorer_player_ids: ['p-final'],
        round_code: 'final',
      }),
    );
    assert.equal(s.star_multiplier, 1);
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 2);
    assert.equal(s.total_pts, 12);
    assert.equal(s.outcome_color, 'teal');
  });

  it('shootout-only scorer excluded by caller → no scorer pts', () => {
    // Caller must strip shootout goals from actual.scorer_player_ids.
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: FRA,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        scorer_player_ids: [PLAYER_B], // PLAYER_A only scored in shootout
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 10); // bundled pick all correct
    assert.equal(s.scorer_pts, 0);
    assert.equal(s.total_pts, 10);
  });
});

// ---------------------------------------------------------------------------
// Goalscorer NOT scored in R1–R4
// ---------------------------------------------------------------------------
describe('goalscorer ignored in R1–R4', () => {
  it('R1 with scorer pick + correct player → scorer_pts 0', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: ['player-a'],
      }),
      actual({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: ['player-a'],
        round_code: 'group_r1',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 0);
    assert.equal(s.total_pts, 10);
  });

  it('R32 with scorer pick + correct player → scorer_pts 0', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: ['player-a'],
      }),
      actual({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: ['player-a'],
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 0);
  });
});

// ---------------------------------------------------------------------------
// Null / missing pick handling
// ---------------------------------------------------------------------------
describe('null / missing pick', () => {
  it('null pick → 0/gray', () => {
    const s = scorePick(
      null,
      actual({ home_score: 2, away_score: 1, round_code: 'group_r1' }),
    );
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'gray');
    assert.equal(s.star_multiplier, 1);
  });

  it('home_score null → 0/gray', () => {
    const s = scorePick(
      pick({ home_score: null, away_score: 1 }),
      actual({ home_score: 2, away_score: 1, round_code: 'group_r1' }),
    );
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'gray');
  });

  it('away_score null → 0/gray', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: null }),
      actual({ home_score: 2, away_score: 1, round_code: 'group_r1' }),
    );
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'gray');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting sanity: every round_code accepted
// ---------------------------------------------------------------------------
describe('round_code acceptance', () => {
  const rounds: RoundCode[] = [
    'group_r1',
    'group_r2',
    'group_r3',
    'r32',
    'r16',
    'qf',
    'sf',
    'final',
  ];
  for (const r of rounds) {
    it(`accepts ${r} without throwing`, () => {
      const s = scorePick(
        pick({ home_score: 1, away_score: 0 }),
        actual({ home_score: 1, away_score: 0, round_code: r }),
      );
      assert.equal(s.exact_pts, 10);
    });
  }
});
