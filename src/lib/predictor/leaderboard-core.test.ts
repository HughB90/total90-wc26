/**
 * Pure-helper tests for predictor leaderboard core.
 *
 * Run with:
 *   node --experimental-strip-types --test src/lib/predictor/leaderboard-core.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clampInt, PUBLIC_LEADERBOARD_CACHE_CONTROL } from './leaderboard-core.ts'

describe('clampInt', () => {
  it('returns fallback when raw is null', () => {
    assert.equal(clampInt(null, 25, 1, 200), 25)
  })

  it('returns fallback when raw is empty string', () => {
    assert.equal(clampInt('', 25, 1, 200), 25)
  })

  it('returns fallback when raw is not a number', () => {
    assert.equal(clampInt('abc', 25, 1, 200), 25)
  })

  it('clamps below min', () => {
    assert.equal(clampInt('-5', 25, 1, 200), 1)
    assert.equal(clampInt('0', 25, 1, 200), 1)
  })

  it('clamps above max', () => {
    assert.equal(clampInt('5000', 25, 1, 200), 200)
  })

  it('passes through valid values', () => {
    assert.equal(clampInt('50', 25, 1, 200), 50)
    assert.equal(clampInt('1', 25, 1, 200), 1)
    assert.equal(clampInt('200', 25, 1, 200), 200)
  })
})

describe('PUBLIC_LEADERBOARD_CACHE_CONTROL', () => {
  it('is a valid Cache-Control directive with s-maxage and SWR', () => {
    assert.match(PUBLIC_LEADERBOARD_CACHE_CONTROL, /public/)
    assert.match(PUBLIC_LEADERBOARD_CACHE_CONTROL, /s-maxage=30/)
    assert.match(PUBLIC_LEADERBOARD_CACHE_CONTROL, /stale-while-revalidate=120/)
  })
})
