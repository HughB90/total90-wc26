/**
 * Tests for round-lock pure helpers.
 *
 * Run with:
 *   node --experimental-strip-types --test src/lib/predictor/round-lock.test.ts
 *
 * The `evaluateLock` helper is intentionally pure so we can unit-test the
 * lock semantics without standing up Supabase. The async wrappers
 * (`getRound1LockAt` / `isProfileNameLocked`) just sit on top of this and a
 * DB read, which is exercised by integration via the API routes.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateLock } from './round-lock-pure.ts'

describe('evaluateLock', () => {
  it('returns false when the lock timestamp is unknown (null)', () => {
    assert.equal(evaluateLock(null), false)
    assert.equal(evaluateLock(null, Date.now() + 1_000_000), false)
  })

  it('returns false strictly before the lock timestamp', () => {
    const lockAt = Date.UTC(2026, 5, 11, 16, 0, 0) // June 11 2026 16:00 UTC
    assert.equal(evaluateLock(lockAt, lockAt - 1), false)
  })

  it('returns true at the exact lock timestamp', () => {
    const lockAt = Date.UTC(2026, 5, 11, 16, 0, 0)
    assert.equal(evaluateLock(lockAt, lockAt), true)
  })

  it('returns true after the lock timestamp', () => {
    const lockAt = Date.UTC(2026, 5, 11, 16, 0, 0)
    assert.equal(evaluateLock(lockAt, lockAt + 60_000), true)
  })
})
