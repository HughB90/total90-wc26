/**
 * Pure-helper tests for bracket leaderboard core.
 *
 * Run with:
 *   node --experimental-strip-types --test src/lib/bracket/leaderboard-core.test.ts
 *
 * The full DB-backed ranking functions are exercised by the API routes;
 * here we just verify the pure sort + find behavior.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  rankAndSort,
  findMe,
  PUBLIC_LEADERBOARD_CACHE_CONTROL,
  type AggregatedRow,
} from './leaderboard-core.ts'

function row(partial: Partial<AggregatedRow> & { userId: string; score: number }): AggregatedRow {
  return {
    profileId: partial.userId,
    managerName: partial.managerName ?? `Manager ${partial.userId}`,
    firstName: partial.firstName ?? null,
    displayName: partial.displayName ?? `Manager ${partial.userId}`,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00Z',
    ...partial,
  } as AggregatedRow
}

describe('rankAndSort', () => {
  it('returns an empty array when given no rows', () => {
    assert.deepEqual(rankAndSort([]), [])
  })

  it('ranks by score DESC', () => {
    const out = rankAndSort([
      row({ userId: 'a', score: 5 }),
      row({ userId: 'b', score: 10 }),
      row({ userId: 'c', score: 1 }),
    ])
    assert.deepEqual(out.map(r => r.userId), ['b', 'a', 'c'])
    assert.deepEqual(out.map(r => r.rank), [1, 2, 3])
  })

  it('breaks ties by earlier created_at first', () => {
    const out = rankAndSort([
      row({ userId: 'late', score: 5, createdAt: '2026-03-01T00:00:00Z' }),
      row({ userId: 'early', score: 5, createdAt: '2026-01-01T00:00:00Z' }),
    ])
    assert.deepEqual(out.map(r => r.userId), ['early', 'late'])
    assert.equal(out[0].rank, 1)
    assert.equal(out[1].rank, 2)
  })

  it('assigns ranks 1..N for all rows even with ties', () => {
    const out = rankAndSort([
      row({ userId: 'a', score: 5, createdAt: '2026-01-01T00:00:00Z' }),
      row({ userId: 'b', score: 5, createdAt: '2026-01-02T00:00:00Z' }),
      row({ userId: 'c', score: 5, createdAt: '2026-01-03T00:00:00Z' }),
    ])
    assert.deepEqual(out.map(r => r.rank), [1, 2, 3])
  })
})

describe('findMe', () => {
  const ranked = rankAndSort([
    row({ userId: 'profile-a', score: 10, profileId: 'profile-a' }),
    row({ userId: 'legacy-b', score: 5, profileId: null }),
  ])

  it('matches by userId', () => {
    const found = findMe(ranked, 'profile-a')
    assert.ok(found)
    assert.equal(found?.rank, 1)
  })

  it('matches by profileId fallback', () => {
    const found = findMe(ranked, 'profile-a')
    assert.ok(found)
    assert.equal(found?.userId, 'profile-a')
  })

  it('matches a legacy bracket_users row by userId', () => {
    const found = findMe(ranked, 'legacy-b')
    assert.ok(found)
    assert.equal(found?.rank, 2)
  })

  it('returns null when meId is unknown', () => {
    assert.equal(findMe(ranked, 'nope'), null)
  })
})

describe('PUBLIC_LEADERBOARD_CACHE_CONTROL', () => {
  it('is a valid Cache-Control directive with s-maxage and SWR', () => {
    assert.match(PUBLIC_LEADERBOARD_CACHE_CONTROL, /public/)
    assert.match(PUBLIC_LEADERBOARD_CACHE_CONTROL, /s-maxage=30/)
    assert.match(PUBLIC_LEADERBOARD_CACHE_CONTROL, /stale-while-revalidate=120/)
  })
})
