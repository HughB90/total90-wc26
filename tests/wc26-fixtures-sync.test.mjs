/**
 * wc26-fixtures-sync.test.mjs
 *
 * Unit tests for the pure helpers behind the Opta → predictor_matches sync.
 *
 * Run: node --experimental-strip-types tests/wc26-fixtures-sync.test.mjs
 */

import assert from 'node:assert/strict'
import {
  buildSyncUpdate,
  isInLiveWindow,
  matchOptaFixtureToPredictor,
  normaliseStatus,
  optaContestantToTeamCode,
  shouldSyncRow,
} from '../src/lib/wc26-fixtures-sync.ts'

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

// ── optaContestantToTeamCode ─────────────────────────────────────────────────
console.log('\noptaContestantToTeamCode')
t('maps 3-letter code MEX → Mexico', () => {
  assert.equal(optaContestantToTeamCode({ code: 'MEX', name: 'Mexico' }), 'Mexico')
})
t('maps 3-letter code RSA → South Africa', () => {
  assert.equal(optaContestantToTeamCode({ code: 'RSA' }), 'South Africa')
})
t('falls back to name when code unknown', () => {
  assert.equal(
    optaContestantToTeamCode({ code: 'XYZ', name: 'Korea Republic' }),
    'South Korea'
  )
})
t('handles Türkiye alias', () => {
  assert.equal(optaContestantToTeamCode({ name: 'Türkiye' }), 'Turkey')
})
t('returns null on unknown', () => {
  assert.equal(optaContestantToTeamCode({ code: 'XYZ', name: 'Atlantis' }), null)
})

// ── normaliseStatus ──────────────────────────────────────────────────────────
console.log('\nnormaliseStatus')
t('Fixture → scheduled', () => {
  const r = normaliseStatus('Fixture')
  assert.equal(r.status, 'scheduled')
})
t('Playing → live (1H default)', () => {
  const r = normaliseStatus('Playing')
  assert.equal(r.status, 'live')
  assert.equal(r.period, '1H')
})
t('Half-time → live + HT', () => {
  const r = normaliseStatus('Half Time')
  assert.equal(r.status, 'live')
  assert.equal(r.period, 'HT')
})
t('Played → final + FT', () => {
  const r = normaliseStatus('Played')
  assert.equal(r.status, 'final')
  assert.equal(r.period, 'FT')
})
t('Postponed → cancelled + POSTPONED', () => {
  const r = normaliseStatus('Postponed')
  assert.equal(r.status, 'cancelled')
  assert.equal(r.period, 'POSTPONED')
})
t('Penalty shootout → live + PEN', () => {
  const r = normaliseStatus('Penalty Shootout')
  assert.equal(r.status, 'live')
  assert.equal(r.period, 'PEN')
})

// ── matchOptaFixtureToPredictor ──────────────────────────────────────────────
console.log('\nmatchOptaFixtureToPredictor')

const rows = [
  {
    id: 'match_001',
    match_num: 1,
    round_code: 'group_r1',
    home_team_code: 'Mexico',
    away_team_code: 'South Africa',
    kickoff_at: '2026-06-11T19:00:00Z', // 14:00 CT (UTC-5)
    opta_fixture_id: null,
  },
  {
    id: 'match_002',
    match_num: 2,
    round_code: 'group_r1',
    home_team_code: 'South Korea',
    away_team_code: 'Czechia',
    kickoff_at: '2026-06-12T02:00:00Z',
    opta_fixture_id: null,
  },
]

t('direct hit on opta_fixture_id when present', () => {
  const r = matchOptaFixtureToPredictor(
    { matchInfo: { id: 'opta_abc' } },
    [{ ...rows[0], opta_fixture_id: 'opta_abc' }, rows[1]]
  )
  assert.equal(r, 'match_001')
})

t('matches by team codes', () => {
  const r = matchOptaFixtureToPredictor(
    {
      matchInfo: {
        id: 'opta_new',
        date: '2026-06-11Z',
        time: '19:00:00Z',
        contestant: [
          { code: 'MEX', position: 'home' },
          { code: 'RSA', position: 'away' },
        ],
      },
    },
    rows
  )
  assert.equal(r, 'match_001')
})

t('handles swapped home/away', () => {
  const r = matchOptaFixtureToPredictor(
    {
      matchInfo: {
        contestant: [
          { code: 'RSA', position: 'home' },
          { code: 'MEX', position: 'away' },
        ],
      },
    },
    rows
  )
  assert.equal(r, 'match_001')
})

t('returns null on unknown team', () => {
  const r = matchOptaFixtureToPredictor(
    {
      matchInfo: {
        contestant: [
          { code: 'XYZ', position: 'home' },
          { code: 'ABC', position: 'away' },
        ],
      },
    },
    rows
  )
  assert.equal(r, null)
})

// ── buildSyncUpdate ──────────────────────────────────────────────────────────
console.log('\nbuildSyncUpdate')

const nowIso = '2026-06-11T20:00:00Z'

t('refines period from periodId=2 → 2H', () => {
  const upd = buildSyncUpdate(
    {
      matchInfo: {
        id: 'opta_2h',
        contestant: [
          { code: 'MEX', position: 'home' },
          { code: 'RSA', position: 'away' },
        ],
      },
      liveData: {
        matchDetails: {
          matchStatus: 'Playing',
          periodId: 2,
          matchTime: 65,
          scores: { total: { home: 1, away: 1 } },
        },
      },
    },
    rows[0],
    nowIso
  )
  assert.equal(upd.patch.period, '2H')
  assert.equal(upd.patch.minute, 65)
  assert.equal(upd.patch.status, 'live')
})

t('periodId=10 → HT', () => {
  const upd = buildSyncUpdate(
    {
      matchInfo: {
        id: 'opta_ht',
        contestant: [
          { code: 'MEX', position: 'home' },
          { code: 'RSA', position: 'away' },
        ],
      },
      liveData: {
        matchDetails: {
          matchStatus: 'Playing',
          periodId: 10,
          matchTime: 45,
          scores: { total: { home: 0, away: 0 } },
        },
      },
    },
    rows[0],
    nowIso
  )
  assert.equal(upd.patch.period, 'HT')
})

t('periodId=14 → final + FT (Played event arrives late)', () => {
  const upd = buildSyncUpdate(
    {
      matchInfo: {
        id: 'opta_done',
        contestant: [
          { code: 'MEX', position: 'home' },
          { code: 'RSA', position: 'away' },
        ],
      },
      liveData: {
        matchDetails: {
          matchStatus: 'Playing', // sometimes stays Playing while periodId flips
          periodId: 14,
          scores: { total: { home: 2, away: 1 } },
        },
      },
    },
    rows[0],
    nowIso
  )
  assert.equal(upd.patch.status, 'final')
  assert.equal(upd.patch.period, 'FT')
})

t('first-pass live match with 1-0 score → patches status/period/score', () => {
  const upd = buildSyncUpdate(
    {
      matchInfo: {
        id: 'opta_abc',
        contestant: [
          { code: 'MEX', position: 'home' },
          { code: 'RSA', position: 'away' },
        ],
      },
      liveData: {
        matchDetails: {
          matchStatus: 'Playing',
          matchLengthMin: 35,
          scores: { total: { home: 1, away: 0 } },
        },
        goal: [
          {
            scorerId: 'p123',
            scorerName: 'H. Lozano',
            timeMin: 22,
            contestantId: 't_mex',
            type: 'G',
            homeScore: 1,
            awayScore: 0,
          },
        ],
      },
    },
    rows[0],
    nowIso
  )
  assert.equal(upd.predictor_match_id, 'match_001')
  assert.equal(upd.patch.status, 'live')
  assert.equal(upd.patch.period, '1H')
  assert.equal(upd.patch.minute, 35)
  assert.equal(upd.patch.home_score, 1)
  assert.equal(upd.patch.away_score, 0)
  assert.equal(upd.patch.opta_fixture_id, 'opta_abc')
  assert.equal(upd.patch.last_synced_at, nowIso)
  assert.equal(upd.patch.goalscorers.length, 1)
  assert.equal(upd.patch.goalscorers[0].scorer_name, 'H. Lozano')
})

t('full-time match flips status to final + FT', () => {
  const upd = buildSyncUpdate(
    {
      matchInfo: {
        id: 'opta_xyz',
        contestant: [
          { code: 'MEX', position: 'home' },
          { code: 'RSA', position: 'away' },
        ],
      },
      liveData: {
        matchDetails: {
          matchStatus: 'Played',
          matchLengthMin: 90,
          scores: { total: { home: 2, away: 1 }, ft: { home: 2, away: 1 } },
        },
      },
    },
    rows[0],
    nowIso
  )
  assert.equal(upd.patch.status, 'final')
  assert.equal(upd.patch.period, 'FT')
  assert.equal(upd.patch.home_score, 2)
  assert.equal(upd.patch.away_score, 1)
  assert.equal(upd.patch.went_to_pks, undefined)
})

t('penalty shootout → went_to_pks=true + winner', () => {
  const upd = buildSyncUpdate(
    {
      matchInfo: {
        id: 'opta_ko',
        contestant: [
          { code: 'BRA', position: 'home' },
          { code: 'ARG', position: 'away' },
        ],
      },
      liveData: {
        matchDetails: {
          matchStatus: 'Played',
          scores: {
            total: { home: 2, away: 2 },
            pen: { home: 5, away: 4 },
          },
        },
      },
    },
    {
      id: 'match_104',
      match_num: 104,
      round_code: 'final',
      home_team_code: 'Brazil',
      away_team_code: 'Argentina',
      kickoff_at: '2026-07-19T19:00:00Z',
      opta_fixture_id: null,
    },
    nowIso
  )
  assert.equal(upd.patch.went_to_pks, true)
  assert.equal(upd.patch.pk_winner_team_code, 'Brazil')
})

// ── shouldSyncRow ────────────────────────────────────────────────────────────
console.log('\nshouldSyncRow')

const now = Date.parse('2026-06-11T19:00:00Z')

t('live row always syncs', () => {
  assert.equal(
    shouldSyncRow(
      { status: 'live', kickoff_at: '2026-06-11T19:00:00Z', last_synced_at: null },
      now
    ),
    true
  )
})

t('final row never syncs', () => {
  assert.equal(
    shouldSyncRow(
      { status: 'final', kickoff_at: '2026-06-11T19:00:00Z', last_synced_at: nowIso },
      now
    ),
    false
  )
})

t('cancelled row never syncs', () => {
  assert.equal(
    shouldSyncRow(
      { status: 'cancelled', kickoff_at: '2026-06-11T19:00:00Z', last_synced_at: null },
      now
    ),
    false
  )
})

t('scheduled row inside 15-min kickoff window syncs', () => {
  assert.equal(
    shouldSyncRow(
      { status: 'scheduled', kickoff_at: '2026-06-11T19:10:00Z', last_synced_at: null },
      now
    ),
    true
  )
})

t('scheduled row far from kickoff does not sync', () => {
  assert.equal(
    shouldSyncRow(
      { status: 'scheduled', kickoff_at: '2026-06-12T19:00:00Z', last_synced_at: nowIso },
      now
    ),
    false
  )
})

// ── isInLiveWindow ───────────────────────────────────────────────────────────
console.log('\nisInLiveWindow')

t('20:00 UTC is in window', () => {
  assert.equal(isInLiveWindow(new Date('2026-06-11T20:00:00Z')), true)
})
t('02:00 UTC is in window (overnight wrap)', () => {
  assert.equal(isInLiveWindow(new Date('2026-06-12T02:00:00Z')), true)
})
t('07:00 UTC is NOT in window', () => {
  assert.equal(isInLiveWindow(new Date('2026-06-11T07:00:00Z')), false)
})

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
