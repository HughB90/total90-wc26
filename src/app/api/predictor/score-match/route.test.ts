/**
 * Input validation tests for POST /api/predictor/score-match.
 *
 * Run with:
 *   node --experimental-strip-types --test \
 *     src/app/api/predictor/score-match/route.test.ts
 *
 * We test the pure `validateScoreMatchRequest` helper directly. The full
 * route handler depends on `next/server` (not resolvable by plain Node
 * ESM), but every auth / body-validation case short-circuits inside the
 * helper before any DB or NextResponse call — so this gives us full
 * coverage of those branches with zero mocking.
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { validateScoreMatchRequest } from './validate.ts'

const ORIGINAL_ENV = process.env.PREDICTOR_ADMIN_KEY

function makeReq(opts: { headers?: Record<string, string>; body?: string } = {}): Request {
  return new Request('http://localhost/api/predictor/score-match', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: opts.body ?? '',
  })
}

describe('validateScoreMatchRequest — auth + body validation', () => {
  beforeEach(() => {
    delete process.env.PREDICTOR_ADMIN_KEY
  })

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.PREDICTOR_ADMIN_KEY
    } else {
      process.env.PREDICTOR_ADMIN_KEY = ORIGINAL_ENV
    }
  })

  it('returns 503 when PREDICTOR_ADMIN_KEY env var is unset', async () => {
    const res = await validateScoreMatchRequest(
      makeReq({
        headers: { 'x-admin-key': 'whatever' },
        body: JSON.stringify({ match_id: 'match_001' }),
      }),
    )
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 503)
    assert.equal(res.body.ok, false)
    assert.match(res.body.error, /PREDICTOR_ADMIN_KEY/)
  })

  it('returns 401 when x-admin-key header does not match', async () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected-key'
    const res = await validateScoreMatchRequest(
      makeReq({
        headers: { 'x-admin-key': 'wrong-key' },
        body: JSON.stringify({ match_id: 'match_001' }),
      }),
    )
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 401)
    assert.equal(res.body.error, 'unauthorized')
  })

  it('returns 401 when x-admin-key header is missing entirely', async () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected-key'
    const res = await validateScoreMatchRequest(
      makeReq({
        body: JSON.stringify({ match_id: 'match_001' }),
      }),
    )
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 401)
  })

  it('returns 400 on empty body (invalid JSON)', async () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected-key'
    const res = await validateScoreMatchRequest(
      makeReq({
        headers: { 'x-admin-key': 'expected-key' },
        body: '',
      }),
    )
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 400)
    assert.equal(res.body.error, 'invalid_json_body')
  })

  it('returns 400 when match_id is missing from JSON body', async () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected-key'
    const res = await validateScoreMatchRequest(
      makeReq({
        headers: { 'x-admin-key': 'expected-key' },
        body: JSON.stringify({}),
      }),
    )
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.status, 400)
    assert.equal(res.body.error, 'match_id_required')
  })

  it('returns 400 when match_id is not a string (number)', async () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected-key'
    const res = await validateScoreMatchRequest(
      makeReq({
        headers: { 'x-admin-key': 'expected-key' },
        body: JSON.stringify({ match_id: 42 }),
      }),
    )
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.body.error, 'match_id_required')
  })

  it('returns 400 when match_id is whitespace-only', async () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected-key'
    const res = await validateScoreMatchRequest(
      makeReq({
        headers: { 'x-admin-key': 'expected-key' },
        body: JSON.stringify({ match_id: '   ' }),
      }),
    )
    assert.equal(res.ok, false)
    if (res.ok) return
    assert.equal(res.body.error, 'match_id_required')
  })

  it('returns ok with trimmed matchId when everything is valid', async () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected-key'
    const res = await validateScoreMatchRequest(
      makeReq({
        headers: { 'x-admin-key': 'expected-key' },
        body: JSON.stringify({ match_id: '  match_042  ' }),
      }),
    )
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(res.matchId, 'match_042')
  })
})
