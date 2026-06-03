/**
 * Tests for WC26 Predictor scoring engine (v2).
 *
 * Run with:
 *   node --experimental-strip-types --test src/lib/predictor/scoring.test.ts
 *
 * Uses Node 26's built-in test runner. No external deps.
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
// Group stage
// ---------------------------------------------------------------------------
describe('group stage (R1)', () => {
  it('exact score correct → 10/teal', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1 }),
      actual({ home_score: 2, away_score: 1, round_code: 'group_r1' }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.result_pts, 0);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('result correct, score wrong → 4/green', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1 }),
      actual({ home_score: 3, away_score: 0, round_code: 'group_r1' }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 4);
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('predicted draw + actual draw + exact → 10/teal', () => {
    const s = scorePick(
      pick({ home_score: 1, away_score: 1 }),
      actual({ home_score: 1, away_score: 1, round_code: 'group_r2' }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('predicted draw + actual non-draw → 0/red', () => {
    const s = scorePick(
      pick({ home_score: 1, away_score: 1 }),
      actual({ home_score: 2, away_score: 0, round_code: 'group_r2' }),
    );
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });

  it('predicted non-draw, actual draw → 0/red (result mismatch)', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 0 }),
      actual({ home_score: 1, away_score: 1, round_code: 'group_r3' }),
    );
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });

  it('completely wrong → 0/red', () => {
    const s = scorePick(
      pick({ home_score: 3, away_score: 0 }),
      actual({ home_score: 0, away_score: 2, round_code: 'group_r1' }),
    );
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

  it('star ignored in R5 — multiplier stays 1', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1, is_star: true }),
      actual({ home_score: 2, away_score: 1, round_code: 'r16' }),
    );
    assert.equal(s.star_multiplier, 1);
    assert.equal(s.total_pts, 10); // exact only, not doubled
  });

  it('star honored in R4 (r32)', () => {
    const s = scorePick(
      pick({ home_score: 2, away_score: 1, is_star: true }),
      actual({
        home_score: 2,
        away_score: 1,
        round_code: 'r32',
      }),
    );
    assert.equal(s.star_multiplier, 2);
    assert.equal(s.total_pts, 20);
  });
});

// ---------------------------------------------------------------------------
// R32 — PK advance interactions
// ---------------------------------------------------------------------------
describe('R32 — PK advance bonus', () => {
  it('wrong scoreline but PK-advance correct (pred draw, PKs, pick won) → 3/green', () => {
    // Pred 1-1, actual 0-0 then Brazil PKs. Score wrong, result was "draw at 90+ET"
    // matches predicted draw — but knockouts always have an advancer, so result_pts
    // is 0 (predicted "draw" → no advancer; actual advancer = Brazil). Just the +3.
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: ARG,
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
    assert.equal(s.result_pts, 0);
    assert.equal(s.advancer_pk_pts, 3);
    assert.equal(s.total_pts, 3);
    assert.equal(s.outcome_color, 'green');
  });

  it('exact draw + PK-advance correct → 13/teal', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.result_pts, 0);
    assert.equal(s.advancer_pk_pts, 3);
    assert.equal(s.total_pts, 13);
    assert.equal(s.outcome_color, 'teal');
  });

  it('exact draw + PK-advance correct + STAR in R32 → 26/teal', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        is_star: true,
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'r32',
      }),
    );
    assert.equal(s.star_multiplier, 2);
    assert.equal(s.total_pts, 26); // (10 + 3) * 2
    assert.equal(s.outcome_color, 'teal');
  });

  it('predicted draw (no PK pick), actual went to ET non-draw → 0/red', () => {
    // Per Hugh's spec list: "R32 predicted draw, actual went to ET non-draw
    // → predicted winner is 'draw' but actual winner = team A → 0/red".
    // This test case has NO pk_advance_team_id, so predicted winner stays
    // 'draw' and mismatches the actual advancer (BRA).
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: null, // <-- key: no PK pick attached
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        pk_winner_team_id: null,
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 0);
    assert.equal(s.advancer_pk_pts, 0);
    assert.equal(s.total_pts, 0);
    assert.equal(s.outcome_color, 'red');
  });

  it('predicted Brazil 2-1, actual Brazil wins on PKs → 4/green', () => {
    // Pred 2-1 (Brazil), 90+ET = 0-0 → PKs → Brazil. Score wrong, exact 0.
    // Result: predicted winner = BRA, actual advancer = BRA → +4.
    // PK advance: predicted non-draw → no bonus.
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        pk_advance_team_id: BRA, // irrelevant (non-draw prediction)
        home_team_id: BRA,
        away_team_id: ARG,
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
    assert.equal(s.advancer_pk_pts, 0);
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('predicted 1-1 + Brazil PK, actual Brazil wins 2-1 in ET → 4/green', () => {
    // Spec worked Example 2: pred 1-1 + Brazil PK + actual Brazil 2-1 ET
    // → 4 result_pts because Brazil "won" / advanced. The library reads
    // pk_advance_team_id as the user's committed knockout winner when the
    // scoreline is a draw.
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        pk_winner_team_id: null,
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 0);
    assert.equal(s.result_pts, 4);
    assert.equal(s.advancer_pk_pts, 0);
    assert.equal(s.total_pts, 4);
    assert.equal(s.outcome_color, 'green');
  });

  it('predicted 1-1 + Brazil PK, actual 1-1 then Brazil PKs → 13/teal', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.advancer_pk_pts, 3);
    assert.equal(s.scorer_pts, 0); // R32 — no goalscorer
    assert.equal(s.total_pts, 13);
    assert.equal(s.outcome_color, 'teal');
  });

  it('predicted draw + PK pick wrong (picked loser) → 0/red on PK; result mismatch', () => {
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        pk_advance_team_id: ARG, // picked away
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA, // home actually won
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 10); // scoreline still exact
    assert.equal(s.advancer_pk_pts, 0); // wrong PK pick
    assert.equal(s.total_pts, 10);
    assert.equal(s.outcome_color, 'teal');
  });

  it('predicted draw, no pk_advance_team_id provided → no bonus', () => {
    const s = scorePick(
      pick({
        home_score: 0,
        away_score: 0,
        pk_advance_team_id: null,
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 0,
        away_score: 0,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        round_code: 'r32',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.advancer_pk_pts, 0);
    assert.equal(s.total_pts, 10);
  });
});

// ---------------------------------------------------------------------------
// R16 — goalscorer
// ---------------------------------------------------------------------------
describe('R16 — anytime goalscorer', () => {
  const PLAYER_A = 'player-a-uuid';
  const PLAYER_B = 'player-b-uuid';

  it('goalscorer correct, score wrong, result wrong → 2/green', () => {
    const s = scorePick(
      pick({
        home_score: 3,
        away_score: 0,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 0,
        away_score: 2,
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

  it('goalscorer correct + result correct + score wrong → 6/green', () => {
    const s = scorePick(
      pick({
        home_score: 3,
        away_score: 0,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        round_code: 'r16',
      }),
    );
    assert.equal(s.result_pts, 4);
    assert.equal(s.scorer_pts, 2);
    assert.equal(s.total_pts, 6);
    assert.equal(s.outcome_color, 'green');
  });

  it('goalscorer correct AND exact score → 12/teal', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_A, PLAYER_B],
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 2);
    assert.equal(s.total_pts, 12);
    assert.equal(s.outcome_color, 'teal');
  });

  it('goalscorer pick not in scorers list → no scorer pts', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [PLAYER_B], // not A
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 0);
    assert.equal(s.total_pts, 10);
  });

  it('goalscorer with shootout-only scorer → caller passes only 90+ET scorers; absent → no scorer pts', () => {
    // Caller is responsible for filtering shootout goals OUT of
    // actual.scorer_player_ids. If they did, and PLAYER_A only scored in
    // the shootout, PLAYER_A won't appear → 0 scorer_pts.
    const s = scorePick(
      pick({
        home_score: 1,
        away_score: 1,
        scorer_player_ids: [PLAYER_A],
        pk_advance_team_id: BRA,
        home_team_id: BRA,
        away_team_id: ARG,
      }),
      actual({
        home_score: 1,
        away_score: 1,
        went_to_pks: true,
        pk_winner_team_id: BRA,
        scorer_player_ids: [PLAYER_B], // PLAYER_A only scored in shootout, excluded
        round_code: 'r16',
      }),
    );
    assert.equal(s.exact_pts, 10);
    assert.equal(s.scorer_pts, 0);
    assert.equal(s.advancer_pk_pts, 3);
    assert.equal(s.total_pts, 13);
  });

  it('empty scorer_player_ids in pick → scorer_pts 0', () => {
    const s = scorePick(
      pick({
        home_score: 2,
        away_score: 1,
        scorer_player_ids: [],
        home_team_id: BRA,
        away_team_id: ARG,
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
        home_team_id: BRA,
        away_team_id: ARG,
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
        home_team_id: BRA,
        away_team_id: ARG,
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

// ---------------------------------------------------------------------------
// Final round (R8) — covers 3rd place playoff too
// ---------------------------------------------------------------------------
describe('R8 final / 3rd-place', () => {
  it('R8 goalscorer + exact + no star (R8 has no stars) → 12', () => {
    const s = scorePick(
      pick({
        home_score: 3,
        away_score: 2,
        scorer_player_ids: ['p-final'],
        is_star: true, // should be ignored
        home_team_id: FRA,
        away_team_id: GER,
      }),
      actual({
        home_score: 3,
        away_score: 2,
        scorer_player_ids: ['p-final'],
        round_code: 'final',
      }),
    );
    assert.equal(s.star_multiplier, 1);
    assert.equal(s.total_pts, 12);
    assert.equal(s.outcome_color, 'teal');
  });
});
