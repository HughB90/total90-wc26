/**
 * Tests for `scoreMatchById` core scoring pipeline.
 *
 * Run with:
 *   node --experimental-strip-types --test \
 *     src/lib/predictor/score-match-core.test.ts
 *
 * We inject a hand-rolled mock Supabase client that mimics just enough of
 * the PostgREST builder surface to exercise:
 *   - happy path (3 picks, 2 distinct profiles)
 *   - 404 (match_not_found)
 *   - 422 (match_not_finalized — home_score null)
 *   - idempotency (calling twice yields identical result + only upserts)
 *
 * We do NOT cover transient DB errors here — those paths just propagate
 * the supabase error.message and a 500 status; tested implicitly by
 * inspecting the route wrapper.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { scoreMatchById } from './score-match-core.ts'

// ---------------------------------------------------------------------------
// Tiny Supabase mock — enough for the builder chains used by the core.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

interface TableState {
  rows: Row[]
}

interface MockState {
  tables: Record<string, TableState>
  upserts: Record<string, Row[][]>
}

function makeMock(initial: Record<string, Row[]>) {
  const state: MockState = {
    tables: Object.fromEntries(
      Object.entries(initial).map(([k, v]) => [k, { rows: [...v] }]),
    ),
    upserts: {},
  }

  function from(table: string) {
    if (!state.tables[table]) state.tables[table] = { rows: [] }
    const tbl = state.tables[table]
    const filters: Array<(r: Row) => boolean> = []

    const builder = {
      select(_cols: string) {
        // chainable — return self
        return builder
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val)
        return builder
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]))
        return builder
      },
      async maybeSingle() {
        const matched = tbl.rows.filter((r) => filters.every((f) => f(r)))
        if (matched.length === 0) return { data: null, error: null }
        return { data: matched[0], error: null }
      },
      // Awaiting the builder itself runs the query — supabase supports this.
      then(
        resolve: (v: { data: Row[]; error: null }) => void,
        _reject?: (e: unknown) => void,
      ) {
        const matched = tbl.rows.filter((r) => filters.every((f) => f(r)))
        resolve({ data: matched, error: null })
      },
      // Chained update().eq(...) — returns awaitable
      update(patch: Row) {
        const updateBuilder = {
          eq(col: string, val: unknown) {
            // Apply update to matching rows
            for (const r of tbl.rows) {
              if (r[col] === val) Object.assign(r, patch)
            }
            return Promise.resolve({ error: null })
          },
        }
        return updateBuilder
      },
      // upsert(rows, opts) — returns awaitable
      upsert(rows: Row[], opts?: { onConflict?: string }) {
        if (!state.upserts[table]) state.upserts[table] = []
        state.upserts[table].push(rows.map((r) => ({ ...r })))
        const conflictCols = (opts?.onConflict ?? 'id').split(',')
        for (const incoming of rows) {
          const idx = tbl.rows.findIndex((r) =>
            conflictCols.every((c) => r[c] === incoming[c]),
          )
          if (idx >= 0) {
            tbl.rows[idx] = { ...tbl.rows[idx], ...incoming }
          } else {
            tbl.rows.push({ ...incoming })
          }
        }
        return Promise.resolve({ error: null })
      },
    }

    return builder
  }

  // Cast to the SupabaseClient shape we use — only `.from` is exercised.
  const client = { from } as unknown as Parameters<typeof scoreMatchById>[1]
  return { client, state }
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function happyPathFixture() {
  return {
    predictor_matches: [
      {
        id: 'match_001',
        round_code: 'group_r1',
        home_team_code: 'USA',
        away_team_code: 'MEX',
        home_score: 2,
        away_score: 1,
        went_to_pks: false,
        pk_winner_team_code: null,
        goalscorers: ['player_aaa', { player_id: 'player_bbb' }, { id: 'player_ccc' }],
        status: 'final',
      },
    ],
    predictor_picks: [
      {
        id: 'pick_1',
        profile_id: 'profile_alice',
        match_id: 'match_001',
        home_score: 2,
        away_score: 1,
        if_draw_winner: null,
        pk_advance_team_id: null,
        is_star: false,
        goalscorer_player_id: 'player_aaa',
        goalscorer_team_code: 'USA',
      },
      {
        id: 'pick_2',
        profile_id: 'profile_bob',
        match_id: 'match_001',
        home_score: 1,
        away_score: 1,
        if_draw_winner: null,
        pk_advance_team_id: null,
        is_star: true,
        goalscorer_player_id: null,
        goalscorer_team_code: null,
      },
      {
        id: 'pick_3',
        profile_id: 'profile_carol',
        match_id: 'match_001',
        home_score: 3,
        away_score: 0,
        if_draw_winner: null,
        pk_advance_team_id: null,
        is_star: false,
        goalscorer_player_id: null,
        goalscorer_team_code: null,
      },
    ],
    predictor_scores: [],
    predictor_leaderboard_cache: [],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreMatchById — happy path', () => {
  it('scores all picks, returns ok with correct shape', async () => {
    const { client, state } = makeMock(happyPathFixture())
    const res = await scoreMatchById('match_001', client)

    assert.equal(res.ok, true)
    if (!res.ok) return

    assert.equal(res.match_id, 'match_001')
    assert.equal(res.scored_profiles, 3) // 3 picks, 3 distinct profiles
    assert.equal(res.cache_refreshed, 3)
    assert.equal(res.match.round_code, 'group_r1')
    assert.equal(res.match.home_team_code, 'USA')
    assert.equal(res.match.away_team_code, 'MEX')
    assert.equal(res.match.home_score, 2)
    assert.equal(res.match.away_score, 1)
    assert.equal(res.match.went_to_pks, false)
    assert.equal(res.match.pk_winner_team_code, null)
    // Goalscorers: parses string, {player_id}, and {id} → 3 ids
    assert.equal(res.match.goalscorer_count, 3)

    // Verify predictor_scores got 3 upserted rows
    const scoreUpserts = state.upserts.predictor_scores ?? []
    assert.equal(scoreUpserts.length, 1)
    assert.equal(scoreUpserts[0].length, 3)
    for (const row of scoreUpserts[0]) {
      assert.equal(row.match_id, 'match_001')
      assert.ok(typeof row.exact_pts === 'number')
      assert.ok(typeof row.result_pts === 'number')
      assert.ok(typeof row.scorer_pts === 'number')
      assert.ok(typeof row.star_multiplier === 'number')
    }

    // Verify leaderboard cache got upserts for all 3 profiles
    const cacheUpserts = state.upserts.predictor_leaderboard_cache ?? []
    assert.equal(cacheUpserts.length, 1)
    assert.equal(cacheUpserts[0].length, 3)
    const profileIds = cacheUpserts[0].map((r) => r.profile_id).sort()
    assert.deepEqual(profileIds, ['profile_alice', 'profile_bob', 'profile_carol'])
    // All cache rows should have winner_pick_pts preserved as 0 (no existing rows)
    for (const row of cacheUpserts[0]) {
      assert.equal(row.winner_pick_pts, 0)
      assert.ok(typeof row.total_pts === 'number')
      assert.ok(typeof row.r1_pts === 'number')
    }
  })

  it('preserves existing winner_pick_pts on cache upsert', async () => {
    const fixture = happyPathFixture()
    fixture.predictor_leaderboard_cache = [
      { profile_id: 'profile_alice', winner_pick_pts: 40 },
      { profile_id: 'profile_bob', winner_pick_pts: 0 },
    ]
    const { client, state } = makeMock(fixture)
    const res = await scoreMatchById('match_001', client)
    assert.equal(res.ok, true)

    const cacheUpserts = state.upserts.predictor_leaderboard_cache ?? []
    const aliceRow = cacheUpserts[0].find((r) => r.profile_id === 'profile_alice')!
    const bobRow = cacheUpserts[0].find((r) => r.profile_id === 'profile_bob')!
    assert.equal(aliceRow.winner_pick_pts, 40)
    assert.equal(bobRow.winner_pick_pts, 0)
  })
})

describe('scoreMatchById — error paths', () => {
  it('returns 404 when match_id is not found', async () => {
    const { client } = makeMock(happyPathFixture())
    const res = await scoreMatchById('does_not_exist', client)
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 404)
    assert.equal(res.error, 'match_not_found')
  })

  it('returns 422 when match is not finalized (home_score null)', async () => {
    const fixture = happyPathFixture()
    fixture.predictor_matches[0].home_score = null
    const { client } = makeMock(fixture)
    const res = await scoreMatchById('match_001', client)
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 422)
    assert.equal(res.error, 'match_not_finalized')
    assert.match(res.detail ?? '', /home_score or away_score/)
  })

  it('returns 422 when away_score is null', async () => {
    const fixture = happyPathFixture()
    fixture.predictor_matches[0].away_score = null
    const { client } = makeMock(fixture)
    const res = await scoreMatchById('match_001', client)
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 422)
  })

  it('returns ok with 0 scored_profiles when no picks exist for the match', async () => {
    const fixture = happyPathFixture()
    fixture.predictor_picks = []
    const { client } = makeMock(fixture)
    const res = await scoreMatchById('match_001', client)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.scored_profiles, 0)
    assert.equal(res.cache_refreshed, 0)
  })
})

describe('scoreMatchById — idempotency', () => {
  it('two consecutive calls return identical results', async () => {
    const { client } = makeMock(happyPathFixture())
    const first = await scoreMatchById('match_001', client)
    const second = await scoreMatchById('match_001', client)
    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    if (!first.ok || !second.ok) return
    assert.equal(first.scored_profiles, second.scored_profiles)
    assert.equal(first.cache_refreshed, second.cache_refreshed)
    assert.deepEqual(first.match, second.match)
  })

  it('second call upserts same number of score rows (no duplication)', async () => {
    const { client, state } = makeMock(happyPathFixture())
    await scoreMatchById('match_001', client)
    await scoreMatchById('match_001', client)
    // Both calls produce one upsert batch each
    const batches = state.upserts.predictor_scores ?? []
    assert.equal(batches.length, 2)
    assert.equal(batches[0].length, 3)
    assert.equal(batches[1].length, 3)
    // After both runs, only 3 rows in predictor_scores (upsert dedupes by
    // (profile_id, match_id)).
    const tbl = state.tables.predictor_scores
    assert.equal(tbl.rows.length, 3)
  })
})
