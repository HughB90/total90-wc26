/**
 * wc-t90-recompute.test.mjs
 * 
 * Tests for the LOCKED v1.2 scoring formulas.
 * Verifies that the TypeScript port matches the original JavaScript implementation.
 */

import { recomputeScores, tierOf, ageR, ageD } from '../src/lib/scoring/wc-t90-recompute.ts';
import assert from 'assert';

console.log('=== WC T90 Recompute Tests ===\n');

// Test 1: Yamal at Cat=72.4 (current DB value)
console.log('Test 1: Yamal at Cat=72.4 (current DB value)');
const yamalCurrent = recomputeScores({
  catScore: 72.4,
  ovr: 89,
  pot: 95,
  wcAge: 18,
  nation: 'Spain',
  startingXi: 1,
});

console.log(`  Cat=72.4, OVR=89, Pot=95, Age=18, Nation=Spain, XI=1`);
console.log(`  → T90=${yamalCurrent.t90}, tenk=${yamalCurrent.tenk}, tenkDyn=${yamalCurrent.tenkDyn}`);

// Known current DB values for Yamal (from task description)
assert.strictEqual(yamalCurrent.t90, 106.5, 'Yamal current T90 should be 106.5');
console.log(`  ✓ T90 matches current DB value (106.5)\n`);

// Test 2: Yamal at Cat=77 (override scenario)
console.log('Test 2: Yamal at Cat=77 (override scenario)');
const yamalOverride = recomputeScores({
  catScore: 77,
  ovr: 89,
  pot: 95,
  wcAge: 18,
  nation: 'Spain',
  startingXi: 1,
});

console.log(`  Cat=77, OVR=89, Pot=95, Age=18, Nation=Spain, XI=1`);
console.log(`  → T90=${yamalOverride.t90}, tenk=${yamalOverride.tenk}, tenkDyn=${yamalOverride.tenkDyn}`);

// T90 should increase when Cat increases
assert(yamalOverride.t90 > yamalCurrent.t90, 'Yamal override T90 should be > current T90');
console.log(`  ✓ T90 increased from ${yamalCurrent.t90} to ${yamalOverride.t90}\n`);

// Test 3: Non-FIFA player (OVR=60, Pot=60, Cat=60)
console.log('Test 3: Non-FIFA player (defaults to 60)');
const nonFifa = recomputeScores({
  catScore: 60,
  ovr: null,  // No FIFA data
  pot: null,  // No FIFA data
  wcAge: 25,
  nation: 'USA',
  startingXi: 1,
});

console.log(`  Cat=60, OVR=null→60, Pot=null→60, Age=25, Nation=USA, XI=1`);
console.log(`  → T90=${nonFifa.t90}, tenk=${nonFifa.tenk}, tenkDyn=${nonFifa.tenkDyn}`);

// Baseline check: T90 should be 60 (since cat=60, ovr=60, pot=60, blended=60, tier=1.0)
assert.strictEqual(nonFifa.t90, 60, 'Non-FIFA player baseline T90 should be 60');
console.log(`  ✓ T90 matches baseline (60)\n`);

// Test 4: Tier lookup
console.log('Test 4: Tier lookup');
assert.strictEqual(tierOf('Spain'), 1.30, 'Spain tier should be 1.30');
assert.strictEqual(tierOf('USA'), 1.00, 'USA tier should be 1.00');
assert.strictEqual(tierOf('Canada'), 0.80, 'Canada tier should be 0.80');
assert.strictEqual(tierOf('Unknown Country'), 1.00, 'Unknown country should default to 1.00');
console.log(`  ✓ Spain=1.30, USA=1.00, Canada=0.80, Unknown=1.00\n`);

// Test 5: Age multipliers
console.log('Test 5: Age multipliers');
assert.strictEqual(ageR(18), 0.92, 'ageR(18) should be 0.92');
assert.strictEqual(ageD(18), 1.20, 'ageD(18) should be 1.20');
assert.strictEqual(ageR(25), 1.05, 'ageR(25) should be 1.05');
assert.strictEqual(ageD(25), 1.00, 'ageD(25) should be 1.00');
assert.strictEqual(ageR(null), 1.00, 'ageR(null) should be 1.00');
assert.strictEqual(ageD(null), 1.00, 'ageD(null) should be 1.00');
console.log(`  ✓ ageR/ageD lookups match spec\n`);

// Test 6: Depth multiplier (different XI values)
console.log('Test 6: Depth multiplier (different XI values)');
const xi1 = recomputeScores({ catScore: 70, ovr: 85, pot: 90, wcAge: 25, nation: 'Spain', startingXi: 1 });
const xi2 = recomputeScores({ catScore: 70, ovr: 85, pot: 90, wcAge: 25, nation: 'Spain', startingXi: 2 });
const xi3 = recomputeScores({ catScore: 70, ovr: 85, pot: 90, wcAge: 25, nation: 'Spain', startingXi: 3 });

console.log(`  Same player at XI=1: T90=${xi1.t90}`);
console.log(`  Same player at XI=2: T90=${xi2.t90}`);
console.log(`  Same player at XI=3: T90=${xi3.t90}`);

assert(xi1.t90 > xi2.t90, 'XI=1 should have higher T90 than XI=2');
assert(xi2.t90 > xi3.t90, 'XI=2 should have higher T90 than XI=3');
console.log(`  ✓ Depth multiplier working correctly (XI=1 > XI=2 > XI=3)\n`);

console.log('✅ All tests passed!');
