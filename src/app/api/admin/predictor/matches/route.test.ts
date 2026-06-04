/**
 * Validation tests for the admin predictor-matches routes.
 *
 * Run with:
 *   node --experimental-strip-types --test \
 *     src/app/api/admin/predictor/matches/route.test.ts
 *
 * We test the pure validate helpers directly. The route handlers depend
 * on next/server (not resolvable by plain Node ESM), but every auth /
 * body-validation case short-circuits inside the helpers before any DB
 * or NextResponse call — full coverage of those branches, no mocking.
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { validateAdminAuth, validateMatchPatchBody } from './validate.ts'

const ORIGINAL_ENV = process.env.PREDICTOR_ADMIN_KEY

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/admin/predictor/matches', {
    method: 'GET',
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('validateAdminAuth — env + header gating', () => {
  beforeEach(() => {
    delete process.env.PREDICTOR_ADMIN_KEY
  })
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.PREDICTOR_ADMIN_KEY
    else process.env.PREDICTOR_ADMIN_KEY = ORIGINAL_ENV
  })

  it('returns 503 when PREDICTOR_ADMIN_KEY is unset', () => {
    const r = validateAdminAuth(makeReq({ 'x-admin-key': 'whatever' }))
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 503)
    assert.match(r.body.error, /PREDICTOR_ADMIN_KEY/)
  })

  it('returns 401 when x-admin-key header is missing', () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected'
    const r = validateAdminAuth(makeReq())
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 401)
    assert.equal(r.body.error, 'unauthorized')
  })

  it('returns 401 when x-admin-key header does not match', () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected'
    const r = validateAdminAuth(makeReq({ 'x-admin-key': 'wrong' }))
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 401)
  })

  it('returns ok when key matches', () => {
    process.env.PREDICTOR_ADMIN_KEY = 'expected'
    const r = validateAdminAuth(makeReq({ 'x-admin-key': 'expected' }))
    assert.equal(r.ok, true)
  })
})

describe('validateMatchPatchBody — type checks', () => {
  it('rejects non-object body', () => {
    const r = validateMatchPatchBody(null)
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 422)
  })

  it('rejects empty object', () => {
    const r = validateMatchPatchBody({})
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 422)
    assert.equal(r.body.error, 'empty_body')
  })

  it('accepts a minimal score update', () => {
    const r = validateMatchPatchBody({ home_score: 2, away_score: 1 })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.update.home_score, 2)
    assert.equal(r.update.away_score, 1)
  })

  it('accepts nulls for home_score / away_score (reset case)', () => {
    const r = validateMatchPatchBody({
      home_score: null,
      away_score: null,
      went_to_pks: false,
      pk_winner_team_code: null,
      goalscorers: [],
      status: 'scheduled',
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.update.home_score, null)
    assert.equal(r.update.status, 'scheduled')
    assert.deepEqual(r.update.goalscorers, [])
  })

  it('rejects non-integer home_score', () => {
    const r = validateMatchPatchBody({ home_score: 2.5 })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 422)
    assert.match(r.body.error, /home_score/)
  })

  it('rejects non-boolean went_to_pks', () => {
    const r = validateMatchPatchBody({ went_to_pks: 'yes' })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 422)
  })

  it('rejects non-array goalscorers', () => {
    const r = validateMatchPatchBody({ goalscorers: 'oops' })
    assert.equal(r.ok, false)
    if (r.ok) return
    assert.equal(r.status, 422)
  })

  it('accepts knockout payload with PK winner + goalscorers', () => {
    const r = validateMatchPatchBody({
      home_score: 1,
      away_score: 1,
      went_to_pks: true,
      pk_winner_team_code: 'USA',
      goalscorers: [{ player_id: '00000000-0000-0000-0000-000000000001', team_code: 'USA', minute: 42 }],
      status: 'final',
    })
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.update.went_to_pks, true)
    assert.equal(r.update.pk_winner_team_code, 'USA')
    assert.equal((r.update.goalscorers as unknown[]).length, 1)
  })
})
