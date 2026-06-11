/**
 * goalscorers.test.mjs
 *
 * Tests for resolveGoalSides — the pure helper that converts the
 * predictor_matches.goalscorers jsonb array into per-side goal rows for UI.
 *
 * Run: node --experimental-strip-types tests/goalscorers.test.mjs
 */

import assert from 'node:assert/strict'
import { resolveGoalSides } from '../src/lib/goalscorers.ts'

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

console.log('\nresolveGoalSides')

// Real production payload from match_001 (MEX 2–0 RSA, 2026-06-11)
const MATCH_001 = [
  {
    type: 'G',
    minute: 9,
    period_id: 1,
    scorer_id: '8oysg1rd2ern90ef3pbxsuwo9',
    scorer_name: 'J. Quiñones',
    contestant_id: '4vofb84dzb5fyc81n2ssws6ah',
    home_score: 1,
    away_score: 0,
  },
  {
    type: 'G',
    minute: 67,
    period_id: 2,
    scorer_id: '5wa8lzp50ccfhxg3j4f65gt79',
    scorer_name: 'R. Jiménez',
    contestant_id: '4vofb84dzb5fyc81n2ssws6ah',
    home_score: 2,
    away_score: 0,
  },
]

t('match_001 (MEX 2-0 RSA): both goals attributed to home', () => {
  const rows = resolveGoalSides(MATCH_001)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].side, 'home')
  assert.equal(rows[0].label, 'J. Quiñones')
  assert.equal(rows[0].minute, 9)
  assert.equal(rows[0].type, 'G')
  assert.equal(rows[1].side, 'home')
  assert.equal(rows[1].label, 'R. Jiménez')
  assert.equal(rows[1].minute, 67)
})

t('alternating goals: home, away, home, away', () => {
  const rows = resolveGoalSides([
    { type: 'G', minute: 10, scorer_name: 'A', home_score: 1, away_score: 0 },
    { type: 'G', minute: 25, scorer_name: 'B', home_score: 1, away_score: 1 },
    { type: 'G', minute: 60, scorer_name: 'C', home_score: 2, away_score: 1 },
    { type: 'G', minute: 88, scorer_name: 'D', home_score: 2, away_score: 2 },
  ])
  assert.deepEqual(
    rows.map((r) => [r.side, r.label]),
    [
      ['home', 'A'],
      ['away', 'B'],
      ['home', 'C'],
      ['away', 'D'],
    ],
  )
})

t('own goal (type O) is marked OG', () => {
  const rows = resolveGoalSides([
    { type: 'O', minute: 33, scorer_name: 'Jorge', home_score: 0, away_score: 1 },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].side, 'away')
  assert.equal(rows[0].type, 'O')
  assert.equal(rows[0].label, 'Jorge')
})

t('penalty (type P) is marked PEN', () => {
  const rows = resolveGoalSides([
    { type: 'P', minute: 45, scorer_name: 'Salah', home_score: 0, away_score: 1 },
  ])
  assert.equal(rows[0].type, 'P')
  assert.equal(rows[0].side, 'away')
})

t('missing scorer_name falls back to "Goal"', () => {
  const rows = resolveGoalSides([
    { type: 'G', minute: 22, scorer_id: 'xyz', home_score: 1, away_score: 0 },
  ])
  assert.equal(rows[0].label, 'Goal')
})

t('null/undefined scorer_name falls back to "Goal"', () => {
  const rows = resolveGoalSides([
    { type: 'G', minute: 22, scorer_name: null, home_score: 1, away_score: 0 },
    { type: 'G', minute: 23, scorer_name: '   ', home_score: 2, away_score: 0 },
  ])
  assert.equal(rows[0].label, 'Goal')
  assert.equal(rows[1].label, 'Goal')
})

t('out-of-order minutes get sorted', () => {
  // Note: when sorting, home_score/away_score act as a truth on running tally
  const rows = resolveGoalSides([
    { type: 'G', minute: 67, scorer_name: 'B', home_score: 2, away_score: 0 },
    { type: 'G', minute: 9, scorer_name: 'A', home_score: 1, away_score: 0 },
  ])
  assert.equal(rows[0].label, 'A')
  assert.equal(rows[0].minute, 9)
  assert.equal(rows[1].label, 'B')
  assert.equal(rows[1].minute, 67)
})

t('explicit side field wins over score deltas', () => {
  const rows = resolveGoalSides([
    { type: 'G', minute: 10, scorer_name: 'X', side: 'away', home_score: 1, away_score: 0 },
  ])
  assert.equal(rows[0].side, 'away')
})

t('explicit team field works too', () => {
  const rows = resolveGoalSides([
    { type: 'G', minute: 10, scorer_name: 'X', team: 'home' },
  ])
  assert.equal(rows[0].side, 'home')
})

t('empty / null / undefined inputs return []', () => {
  assert.deepEqual(resolveGoalSides([]), [])
  assert.deepEqual(resolveGoalSides(null), [])
  assert.deepEqual(resolveGoalSides(undefined), [])
  assert.deepEqual(resolveGoalSides('not-an-array'), [])
})

t('garbage entry skipped, valid entries kept', () => {
  const rows = resolveGoalSides([
    null,
    'bad',
    { type: 'G', minute: 10, scorer_name: 'A', home_score: 1, away_score: 0 },
    { type: 'G', minute: 20 }, // no scores, no side — skipped
    { type: 'G', minute: 30, scorer_name: 'B', home_score: 1, away_score: 1 },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].label, 'A')
  assert.equal(rows[1].label, 'B')
  assert.equal(rows[1].side, 'away')
})

t('null minute sorts last', () => {
  const rows = resolveGoalSides([
    { type: 'G', minute: null, scorer_name: 'Last', home_score: 2, away_score: 0 },
    { type: 'G', minute: 10, scorer_name: 'First', home_score: 1, away_score: 0 },
  ])
  assert.equal(rows[0].label, 'First')
  assert.equal(rows[1].label, 'Last')
  assert.equal(rows[1].minute, null)
})

t('full extra-time scoreline still resolves', () => {
  const rows = resolveGoalSides([
    { type: 'G', minute: 12, scorer_name: 'A', home_score: 1, away_score: 0 },
    { type: 'G', minute: 35, scorer_name: 'B', home_score: 1, away_score: 1 },
    { type: 'P', minute: 88, scorer_name: 'C', home_score: 1, away_score: 2 },
    { type: 'G', minute: 92, scorer_name: 'D', home_score: 2, away_score: 2 }, // 90+2
    { type: 'O', minute: 113, scorer_name: 'E', home_score: 3, away_score: 2 }, // ET
  ])
  assert.equal(rows.length, 5)
  assert.equal(rows[0].side, 'home') // A
  assert.equal(rows[1].side, 'away') // B
  assert.equal(rows[2].side, 'away') // C (PEN)
  assert.equal(rows[2].type, 'P')
  assert.equal(rows[3].side, 'home') // D
  assert.equal(rows[4].side, 'home') // E (OG by away team)
  assert.equal(rows[4].type, 'O')
})

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
