/**
 * predictor-phase4-trigger.test.mjs
 *
 * Unit tests for the Phase 4 trigger decision: given a (prev_status,
 * new_status) tuple, decide whether to fire /api/predictor/score-match
 * after applying the Opta sync patch.
 *
 * Run: node --experimental-strip-types tests/predictor-phase4-trigger.test.mjs
 */

import assert from 'node:assert/strict'
import { shouldTriggerPhase4 } from '../src/lib/wc26-fixtures-sync.ts'

let pass = 0
let fail = 0
function t(name, fn) {
  try {
    fn()
    console.log(`  \u2713 ${name}`)
    pass++
  } catch (e) {
    console.log(`  \u2717 ${name}\n    ${e?.message || e}`)
    fail++
  }
}

console.log('\nshouldTriggerPhase4')

t('live → final: fires', () => {
  assert.equal(shouldTriggerPhase4('live', 'final'), true)
})

t('scheduled → final: fires (late catch-up)', () => {
  assert.equal(shouldTriggerPhase4('scheduled', 'final'), true)
})

t('null → final: fires (first-ever sync)', () => {
  assert.equal(shouldTriggerPhase4(null, 'final'), true)
})

t('undefined → final: fires', () => {
  assert.equal(shouldTriggerPhase4(undefined, 'final'), true)
})

t('final → final: does NOT fire (idempotency)', () => {
  assert.equal(shouldTriggerPhase4('final', 'final'), false)
})

t('live → live: does not fire', () => {
  assert.equal(shouldTriggerPhase4('live', 'live'), false)
})

t('scheduled → live: does not fire', () => {
  assert.equal(shouldTriggerPhase4('scheduled', 'live'), false)
})

t('live → cancelled: does not fire', () => {
  assert.equal(shouldTriggerPhase4('live', 'cancelled'), false)
})

t('live → undefined (no patch status): does not fire', () => {
  assert.equal(shouldTriggerPhase4('live', undefined), false)
})

t('final → live: does not fire (impossible but safe)', () => {
  assert.equal(shouldTriggerPhase4('final', 'live'), false)
})

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
