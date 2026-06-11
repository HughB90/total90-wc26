/**
 * predictor-pick-cap.test.mjs
 *
 * Tests for the persisted-set 16-pick cap + per-match kickoff lock + star-lock
 * rule that fix the Jeff McMenis 17-pick bug (2026-06-11).
 *
 * Run: `node --experimental-strip-types tests/predictor-pick-cap.test.mjs`
 * (or wire into the existing test runner once one exists)
 */

import assert from 'node:assert/strict'
import {
  checkPersistedSetCap,
  splitByMatchLock,
  checkStarRule,
  GROUP_ROUND_CAP,
} from '../src/lib/predictor-pick-validation.ts'

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

console.log('\n=== Predictor pick-cap + per-match lock ===')

// ── Persisted-set cap ──────────────────────────────────────────────────────
console.log('\n[checkPersistedSetCap]')

t('group round: 0 existing + 16 incoming \u2192 ok', () => {
  const existing = []
  const incoming = Array.from({ length: 16 }, (_, i) => ({ match_id: `m${i + 1}` }))
  const r = checkPersistedSetCap('group_r1', existing, incoming)
  assert.equal(r.ok, true)
  assert.equal(r.projected, 16)
})

t('group round: 16 existing + 1 NEW incoming \u2192 reject (the Jeff bug)', () => {
  const existing = Array.from({ length: 16 }, (_, i) => ({ match_id: `m${i + 1}`, is_star: false }))
  const incoming = [{ match_id: 'm17' }] // new match \u2192 17 total
  const r = checkPersistedSetCap('group_r1', existing, incoming)
  assert.equal(r.ok, false)
  assert.equal(r.current, 16)
  assert.equal(r.projected, 17)
  assert.deepEqual(r.newAdditions, ['m17'])
})

t('Jeff scenario: 1 existing + bulk-16 where one collides \u2192 ok (16 total)', () => {
  // Replays Jeff's exact flow:
  //   1. 02:59 UTC: saved 1 pick on match_017
  //   2. 03:17 UTC: bulk-saved 16 picks INCLUDING match_017
  // The new bulk should be a no-op on match_017 (edit, not add) so the
  // post-save set size is 16, not 17.
  const existing = [{ match_id: 'match_017', is_star: false }]
  const incoming = Array.from({ length: 16 }, (_, i) => ({
    match_id: `match_0${String(i + 1).padStart(2, '0')}`,
  }))
  // incoming includes match_017 (i=16 would be 017? let's force it)
  // Actually our generator produces match_001..match_016, none of which is
  // match_017. So that bulk WOULD push to 17 and should be rejected.
  const r1 = checkPersistedSetCap('group_r1', existing, incoming)
  assert.equal(r1.ok, false)
  assert.equal(r1.projected, 17)

  // Now repeat with match_017 included in the bulk \u2192 should be ok.
  const incomingWith17 = [
    ...Array.from({ length: 15 }, (_, i) => ({
      match_id: `match_0${String(i + 1).padStart(2, '0')}`,
    })),
    { match_id: 'match_017' },
  ]
  const r2 = checkPersistedSetCap('group_r1', existing, incomingWith17)
  assert.equal(r2.ok, true)
  assert.equal(r2.projected, 16)
})

t('group round: 16 existing + edit only \u2192 ok (no count change)', () => {
  const existing = Array.from({ length: 16 }, (_, i) => ({ match_id: `m${i + 1}`, is_star: false }))
  const incoming = [{ match_id: 'm5' }] // edit existing
  const r = checkPersistedSetCap('group_r1', existing, incoming)
  assert.equal(r.ok, true)
  assert.equal(r.projected, 16)
  assert.deepEqual(r.newAdditions, [])
})

t('knockout round: cap not enforced (different check used)', () => {
  // Knockout rounds use a fixed-expected-count check elsewhere, so this
  // helper should not block them based on cap.
  const existing = Array.from({ length: 8 }, (_, i) => ({ match_id: `m${i + 1}`, is_star: false }))
  const incoming = Array.from({ length: 16 }, (_, i) => ({ match_id: `m${i + 100}` }))
  const r = checkPersistedSetCap('r16', existing, incoming)
  assert.equal(r.ok, true)
})

t('cap constant is 16', () => {
  assert.equal(GROUP_ROUND_CAP, 16)
})

// ── Per-match kickoff lock ─────────────────────────────────────────────────
console.log('\n[splitByMatchLock]')

const now = 1_700_000_000_000 // fixed for determinism
const future = new Date(now + 60_000).toISOString()
const past = new Date(now - 60_000).toISOString()

t('all matches in the future \u2192 nothing locked', () => {
  const r = splitByMatchLock(
    [{ match_id: 'm1' }, { match_id: 'm2' }],
    [
      { id: 'm1', round_code: 'group_r1', kickoff_at: future },
      { id: 'm2', round_code: 'group_r1', kickoff_at: future },
    ],
    now,
  )
  assert.equal(r.unlocked.length, 2)
  assert.equal(r.lockedDetails.length, 0)
})

t('mixed batch \u2192 splits cleanly', () => {
  const r = splitByMatchLock(
    [{ match_id: 'm1' }, { match_id: 'm2' }, { match_id: 'm3' }],
    [
      { id: 'm1', round_code: 'group_r1', kickoff_at: future },
      { id: 'm2', round_code: 'group_r1', kickoff_at: past }, // locked
      { id: 'm3', round_code: 'group_r1', kickoff_at: future },
    ],
    now,
  )
  assert.equal(r.unlocked.length, 2)
  assert.equal(r.lockedDetails.length, 1)
  assert.equal(r.lockedDetails[0].match_id, 'm2')
})

t('unknown match_id surfaces separately', () => {
  const r = splitByMatchLock(
    [{ match_id: 'm1' }, { match_id: 'mystery' }],
    [{ id: 'm1', round_code: 'group_r1', kickoff_at: future }],
    now,
  )
  assert.deepEqual(r.unknown, ['mystery'])
})

t('exact-kickoff-time match is treated as LOCKED', () => {
  // kickoff_at <= now should lock. Equal-to-now is locked.
  const eq = new Date(now).toISOString()
  const r = splitByMatchLock(
    [{ match_id: 'm1' }],
    [{ id: 'm1', round_code: 'group_r1', kickoff_at: eq }],
    now,
  )
  assert.equal(r.lockedDetails.length, 1)
})

// ── Star-lock rule ─────────────────────────────────────────────────────────
console.log('\n[checkStarRule]')

t('no existing star + new star on unlocked match \u2192 ok', () => {
  const r = checkStarRule({
    existing: [],
    incoming: [{ match_id: 'm1', is_star: true }],
    matches: [{ id: 'm1', round_code: 'group_r1', kickoff_at: future }],
    nowMs: now,
  })
  assert.equal(r.ok, true)
})

t('starring a locked match \u2192 reject (cannot_star_locked_match)', () => {
  const r = checkStarRule({
    existing: [],
    incoming: [{ match_id: 'm1', is_star: true }],
    matches: [{ id: 'm1', round_code: 'group_r1', kickoff_at: past }],
    nowMs: now,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'cannot_star_locked_match')
})

t('moving star OFF a locked match \u2192 reject (star_locked)', () => {
  const r = checkStarRule({
    existing: [{ match_id: 'm1', is_star: true }],
    incoming: [{ match_id: 'm2', is_star: true }],
    matches: [
      { id: 'm1', round_code: 'group_r1', kickoff_at: past },
      { id: 'm2', round_code: 'group_r1', kickoff_at: future },
    ],
    nowMs: now,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'star_locked')
})

t('clearing star FROM a locked match \u2192 reject (star_locked)', () => {
  const r = checkStarRule({
    existing: [{ match_id: 'm1', is_star: true }],
    incoming: [{ match_id: 'm1', is_star: false }],
    matches: [{ id: 'm1', round_code: 'group_r1', kickoff_at: past }],
    nowMs: now,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'star_locked')
})

t('moving star between unlocked matches \u2192 ok', () => {
  const r = checkStarRule({
    existing: [{ match_id: 'm1', is_star: true }],
    incoming: [{ match_id: 'm2', is_star: true }],
    matches: [
      { id: 'm1', round_code: 'group_r1', kickoff_at: future },
      { id: 'm2', round_code: 'group_r1', kickoff_at: future },
    ],
    nowMs: now,
  })
  assert.equal(r.ok, true)
})

t('idempotent re-save of locked starred match \u2192 ok', () => {
  // User re-submits the same locked star, no change \u2192 should pass.
  const r = checkStarRule({
    existing: [{ match_id: 'm1', is_star: true }],
    incoming: [{ match_id: 'm1', is_star: true }],
    matches: [{ id: 'm1', round_code: 'group_r1', kickoff_at: past }],
    nowMs: now,
  })
  assert.equal(r.ok, true)
})

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
