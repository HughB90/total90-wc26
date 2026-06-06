/**
 * v1.4 scoring controller — verification harness.
 *
 * Run with: `npx tsx tests/scoring-v1-4.test.mjs`
 *           or `node --import tsx tests/scoring-v1-4.test.mjs`
 *
 * Reference cases:
 *   1. Mbappé — Real Madrid vs Marseille (synthetic stat line from
 *      ~/.openclaw/workspace/t90-fantasy-wc/mbappe-wk1-full-score.md).
 *      Documented total: ~59.65 pts.
 *
 *   2. Hand-rolled spot-checks for each position to verify multipliers.
 *
 *   3. GK v1.4 deflations — verify GK keeper-throw etc. use the deflated values.
 */

import {
  computeFantasyPoints,
  getPosType,
  goalPts,
  assistPts,
  MULT,
} from '../src/lib/t90-scoring/v1-4.ts';

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, actual, expected, eps = 0.01) {
  const ok = Math.abs(actual - expected) <= eps;
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}: ${actual}`);
  } else {
    fail++;
    failures.push({ label, actual, expected });
    console.log(`  ✗ ${label}: got ${actual}, expected ${expected}`);
  }
}

function header(title) {
  console.log(`\n=== ${title} ===`);
}

// ---------- 1. Escalating goal/assist sanity ----------
header('Escalating goal/assist rules');

assert('FWD 1 goal', goalPts(1, 'FWD'), 7);
assert('FWD 2 goals (7+9)', goalPts(2, 'FWD'), 16);
assert('FWD 3 goals (7+9+11)', goalPts(3, 'FWD'), 27);
assert('FWD 4 goals (7+9+11+11)', goalPts(4, 'FWD'), 38);

assert('MID 1 goal', goalPts(1, 'MID'), 5);
assert('MID 2 goals (5+6)', goalPts(2, 'MID'), 11);
assert('MID 3 goals (5+6+7)', goalPts(3, 'MID'), 18);

assert('DEF 1 goal', goalPts(1, 'DEF'), 3);
assert('DEF 3 goals', goalPts(3, 'DEF'), 9);

assert('FWD 1 assist', assistPts(1, 'FWD'), 7);
assert('FWD 2 assists (7+8)', assistPts(2, 'FWD'), 15);
assert('FWD 3 assists (7+8+9)', assistPts(3, 'FWD'), 24);

assert('MID 1 assist', assistPts(1, 'MID'), 5);
assert('MID 2 assists (5+7)', assistPts(2, 'MID'), 12);

assert('DEF 1 assist', assistPts(1, 'DEF'), 3);

// ---------- 2. Position normalization ----------
header('Position normalization');
assert('"Goalkeeper" → GK', getPosType('Goalkeeper') === 'GK' ? 1 : 0, 1);
assert('"Defender" → DEF', getPosType('Defender') === 'DEF' ? 1 : 0, 1);
assert('"Striker" → FWD', getPosType('Striker') === 'FWD' ? 1 : 0, 1);
assert('"Attacking Midfielder" → FWD', getPosType('Attacking Midfielder') === 'FWD' ? 1 : 0, 1);
assert('"Wing Back" → DEF', getPosType('Wing Back') === 'DEF' ? 1 : 0, 1);
assert('"Midfielder" → MID', getPosType('Midfielder') === 'MID' ? 1 : 0, 1);

// ---------- 3. v1.4 GK deflations ----------
header('v1.4 GK deflations');
assert('GK ballRecovery (br) = 0', MULT.GK.br, 0);
assert('GK accurateLongBalls (lb) = 0.1', MULT.GK.lb, 0.1);
assert('GK accurateKeeperThrows (gkt) = 0.25', MULT.GK.gkt, 0.25);
assert('GK accurateGoalKicks (gkk) = 0.2', MULT.GK.gkk, 0.2);

// ---------- 4. DEF cleanSheet = 3 ----------
header('v1.4 DEF cleanSheet = 3');
assert('DEF cs multiplier = 3', MULT.DEF.cs, 3);
assert('GK cs multiplier = 3', MULT.GK.cs, 3);

// ---------- 5. Mbappé — Real Madrid vs Marseille ----------
// Reference: ~/.openclaw/workspace/t90-fantasy-wc/mbappe-wk1-full-score.md
// Documented total: ~59.65 pts
//
// However, that reference doc only goes through SOME endpoints. Specifically:
// it counts "wonContest" = 4 (dribbles WON, not attempted) at 4 pts. It also
// uses "totalScoringAtt (off target)" = 5 at 1 pts (which we treat as shotOffTarget).
//
// Important reference deltas (per spec doc):
//   - Per the doc the breakdown column shows "goals (all incl. pens) 2 × 7 = 14"
//     — meaning the reference doc charges 2 × 7 (NOT escalating 7+9=16) for the goals.
//     This is BECAUSE the doc was hand-rolled before the escalating rule was
//     finalized. Under v1.4 (escalating), 2 FWD goals = 7+9 = 16 (not 14).
//
// So the v1.4 controller will score Mbappé's line at ~59.65 + 2 = ~61.65.
// That's the "v1.4 strict" total.
//
// Endpoints in the doc:
//   goals 2, attPenGoal 2, attPenMiss 0, goalAssist 0,
//   ontargetScoringAtt 3, shotOffTarget 5, penaltyWon 0, wasFouled 1,
//   wonContest 4 (won), aerialWon 0, totalTackle 0, interceptionWon 0,
//   penaltyConceded 0, ownGoals 0, fouls 0, yellowCard 0, redCard 0,
//   accuratePass 26, accurateLongBalls 0, successfulFinalThirdPasses 3,
//   penAreaEntries 1, accurateThroughBall 1, totalAttAssist 6,
//   touchesInOppBox 14, winningGoal 1, ballRecovery 1, dispossessed 1,
//   possLostAll 1, minsPlayed 90
//
// Note: totalOffside is in the doc but isn't in our MULT table — it's NOT a v1.4
// endpoint (the spec's MULT has no `offside` key). So we drop the -1 from offside.
//
// Expected v1.4 strict total: ~61.65 (62.65 minus 1.0 offside) but we lose the
// -1 offside since v1.4 doesn't reward/penalize it. Recompute:
//
// Reference doc total: 32.0 + 0 + (-1) + 3.4 + 26.0 + (-0.75) = 59.65
// v1.4 escalating goals adjustment: +2 (16 vs 14)
// v1.4 drop offside penalty: +1 (we don't score offside)
// → Expected: 59.65 + 2 + 1 = 62.65
header('Mbappé — Real Madrid vs Marseille (v1.4 strict)');
const mbappeStats = {
  minsPlayed: 90,
  goals: 2,
  attPenGoal: 2,
  attPenMiss: 0,
  goalAssist: 0,
  ontargetScoringAtt: 3,
  shotOffTarget: 5,
  penaltyWon: 0,
  wasFouled: 1,
  wonContest: 4,
  aerialWon: 0,
  totalTackle: 0,
  interceptionWon: 0,
  penaltyConceded: 0,
  ownGoals: 0,
  fouls: 0,
  yellowCard: 0,
  redCard: 0,
  accuratePass: 26,
  accurateLongBalls: 0,
  successfulFinalThirdPasses: 3,
  penAreaEntries: 1,
  accurateThroughBall: 1,
  totalAttAssist: 6,
  touchesInOppBox: 14,
  winningGoal: 1,
  ballRecovery: 1,
  dispossessed: 1,
  possLostAll: 1,
};

const mbappeResult = computeFantasyPoints(mbappeStats, 'FWD');
console.log('  breakdown:', JSON.stringify(mbappeResult.breakdown, null, 2));
assert(
  'Mbappé total ≈ 62.65 (59.65 ref + 2 escalating goals + 1 dropped offside)',
  mbappeResult.total,
  62.65,
  0.1
);

// Sub-checks: verify the key escalating line items
assert('Mbappé goals (2 FWD = 7+9)', mbappeResult.breakdown.goals, 16);
assert('Mbappé minutes (≥45 FWD)', mbappeResult.breakdown['minsPlayed>=45'], 3);
assert('Mbappé attPenGoal (2 × 1)', mbappeResult.breakdown.attPenGoal, 2);
assert('Mbappé ontargetScoringAtt (3 × 1)', mbappeResult.breakdown.ontargetScoringAtt, 3);
assert('Mbappé shotOffTarget (5 × 1)', mbappeResult.breakdown.shotOffTarget, 5);
assert('Mbappé wasFouled (1 × 1)', mbappeResult.breakdown.wasFouled, 1);
assert('Mbappé wonContest (4 × 1)', mbappeResult.breakdown.wonContest, 4);
assert('Mbappé touchesInOppBox (14 × 1)', mbappeResult.breakdown.touchesInOppBox, 14);
assert('Mbappé totalAttAssist (6 × 1)', mbappeResult.breakdown.totalAttAssist, 6);
assert('Mbappé winningGoal (1 × 5)', mbappeResult.breakdown.winningGoal, 5);
assert('Mbappé accurateThroughBall (1 × 1)', mbappeResult.breakdown.accurateThroughBall, 1);
assert('Mbappé accuratePass (26 × 0.1)', mbappeResult.breakdown.accuratePass, 2.6);
assert('Mbappé successfulFinalThirdPasses (3 × 0.2)', mbappeResult.breakdown.successfulFinalThirdPasses, 0.6);
assert('Mbappé penAreaEntries (1 × 0.2)', mbappeResult.breakdown.penAreaEntries, 0.2);
assert('Mbappé ballRecovery (1 × 0.5)', mbappeResult.breakdown.ballRecovery, 0.5);
assert('Mbappé dispossessed (1 × -1)', mbappeResult.breakdown.dispossessed, -1);
assert('Mbappé possLostAll (1 × -0.25)', mbappeResult.breakdown.possLostAll, -0.25);

// ---------- 6. Hand-rolled DEF clean-sheet test ----------
header('DEF clean sheet (v1.4 = +3)');
const defCSStats = {
  minsPlayed: 90,
  goalsConceded: 0,
  goals: 0,
  goalAssist: 0,
  totalTackle: 4,
  interceptionWon: 2,
  blockedScoringAtt: 1,
  accuratePass: 60,
};
const defCSResult = computeFantasyPoints(defCSStats, 'DEF');
console.log('  breakdown:', JSON.stringify(defCSResult.breakdown, null, 2));
// Expected: m45=7 + cs=3 + tackles 4×1=4 + iw 2×1=2 + bl 1×0.5=0.5 + pass 60×0.1=6
//         = 7+3+4+2+0.5+6 = 22.5
assert('DEF clean sheet total', defCSResult.total, 22.5);
assert('cleanSheet line item = 3', defCSResult.breakdown.cleanSheet, 3);

// ---------- 7. GK clean sheet w/ saves + v1.4 deflations ----------
header('GK clean sheet + v1.4 deflations');
const gkStats = {
  minsPlayed: 90,
  goalsConceded: 0,
  saves: 6,
  penaltySave: 0,
  goodHighClaim: 2,
  accurateGoalKicks: 8,     // v1.4: × 0.2 = 1.6
  accurateKeeperThrows: 10, // v1.4: × 0.25 = 2.5
  accurateLongBalls: 5,     // v1.4: × 0.1 = 0.5
  ballRecovery: 4,          // v1.4: × 0 = 0
  accuratePass: 30,         // × 0.1 = 3
};
const gkResult = computeFantasyPoints(gkStats, 'GK');
console.log('  breakdown:', JSON.stringify(gkResult.breakdown, null, 2));
// Expected: m45=10 + cs=3 + saves 6×1=6 + hc 2×1=2 + gkk 8×0.2=1.6 + gkt 10×0.25=2.5
//         + lb 5×0.1=0.5 + br 4×0=0 + pass 30×0.1=3
//         = 10+3+6+2+1.6+2.5+0.5+0+3 = 28.6
assert('GK clean sheet total (v1.4 deflations applied)', gkResult.total, 28.6);
assert('GK accurateGoalKicks line (deflated 0.5→0.2)', gkResult.breakdown.accurateGoalKicks, 1.6);
assert('GK accurateKeeperThrows line (deflated 0.5→0.25)', gkResult.breakdown.accurateKeeperThrows, 2.5);
assert('GK accurateLongBalls line (deflated 0.5→0.1)', gkResult.breakdown.accurateLongBalls, 0.5);
// ballRecovery zero’d → shouldn't even be in breakdown (we skip 0s)
assert(
  'GK ballRecovery zeroed (omitted from breakdown)',
  gkResult.breakdown.ballRecovery === undefined ? 1 : 0,
  1
);

// ---------- Final ----------
console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.label}: got ${f.actual}, expected ${f.expected}`);
  }
  process.exit(1);
}
console.log('All v1.4 scoring tests passed ✓');
