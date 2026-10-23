import { describe, it, expect } from 'vitest'
import { buildSyncUpdate } from './wc26-fixtures-sync'

/**
 * Regression tests for the Opta score-mapping bug caught 2026-07-03.
 *
 * When a match went to penalties, Opta returns:
 *   scores.ft    = { home: 1, away: 1 }   // regulation
 *   scores.et    = { home: 1, away: 1 }   // end of extra time (may be present)
 *   scores.pen   = { home: 2, away: 4 }   // shootout tally
 *   scores.total = { home: 3, away: 5 }   // ft + pen combined
 *
 * predictor_matches.home_score / away_score MUST be the end-of-ET line
 * (before the shootout). The scoring engine consumes went_to_pks +
 * pk_winner_team_code separately. Writing the combined total meant every
 * user's pick scored as if it were a decisive regulation result.
 */

const HOME_ID = 'home-oid'
const AWAY_ID = 'away-oid'

const predictorRow = {
  id: 'match_086',
  opta_fixture_id: 'opta-1',
  home_team_code: 'Australia',
  away_team_code: 'Egypt',
  kickoff_at: '2026-07-03T18:00:00Z',
}

function makeOptaMatch(overrides: {
  ft?: { home: number; away: number } | null
  et?: { home: number; away: number } | null
  pen?: { home: number; away: number } | null
  total?: { home: number; away: number } | null
  periodId?: number
  status?: string
}) {
  const scores: Record<string, { home: number; away: number }> = {}
  if (overrides.ft) scores.ft = overrides.ft
  if (overrides.et) scores.et = overrides.et
  if (overrides.pen) scores.pen = overrides.pen
  if (overrides.total) scores.total = overrides.total

  return {
    matchInfo: {
      id: 'opta-1',
      contestant: [
        {
          id: HOME_ID,
          position: 'home' as const,
          name: 'Australia',
          code: 'AUS',
          country: { name: 'Australia' },
        },
        {
          id: AWAY_ID,
          position: 'away' as const,
          name: 'Egypt',
          code: 'EGY',
          country: { name: 'Egypt' },
        },
      ],
      date: '2026-07-03Z',
      time: '18:00:00Z',
    },
    liveData: {
      matchDetails: {
        periodId: overrides.periodId ?? 14,
        matchStatus: overrides.status ?? 'Played',
        scores,
      },
    },
  } as never
}

describe('buildSyncUpdate score mapping', () => {
  it('regulation win: writes ft score, no pk flag', () => {
    const opta = makeOptaMatch({
      ft: { home: 2, away: 1 },
      total: { home: 2, away: 1 },
    })
    const update = buildSyncUpdate(opta, predictorRow, '2026-07-03T21:00:00Z')
    expect(update.patch.home_score).toBe(2)
    expect(update.patch.away_score).toBe(1)
    expect(update.patch.went_to_pks).toBeUndefined()
    expect(update.patch.pk_winner_team_code).toBeUndefined()
  })

  it('PK shootout: writes ET (not total) score + went_to_pks + pk winner', () => {
    // The bug case: Australia 1-1 Egypt in reg, Egypt won pens 4-2.
    // Opta returns total = ft + pen = 3-5. We must NOT write 3-5.
    const opta = makeOptaMatch({
      ft: { home: 1, away: 1 },
      et: { home: 1, away: 1 },
      pen: { home: 2, away: 4 },
      total: { home: 3, away: 5 },
    })
    const update = buildSyncUpdate(opta, predictorRow, '2026-07-03T21:00:00Z')
    expect(update.patch.home_score).toBe(1)
    expect(update.patch.away_score).toBe(1)
    expect(update.patch.went_to_pks).toBe(true)
    expect(update.patch.pk_winner_team_code).toBe('Egypt')
  })

  it('PK shootout without et field: falls back to ft', () => {
    // Some Opta feeds omit `et` even for ET-decided matches. `ft` should
    // still be preferred over `total` when a shootout occurred.
    const opta = makeOptaMatch({
      ft: { home: 1, away: 1 },
      pen: { home: 5, away: 4 },
      total: { home: 6, away: 5 },
    })
    const update = buildSyncUpdate(opta, predictorRow, '2026-07-03T21:00:00Z')
    expect(update.patch.home_score).toBe(1)
    expect(update.patch.away_score).toBe(1)
    expect(update.patch.went_to_pks).toBe(true)
    expect(update.patch.pk_winner_team_code).toBe('Australia')
  })

  it('legacy feed with only total: still writes it (no pk info)', () => {
    // Older / partial feeds without ft/et — falling back to total is fine
    // because there's also no `pen` block, so no shootout confusion.
    const opta = makeOptaMatch({ total: { home: 3, away: 0 } })
    const update = buildSyncUpdate(opta, predictorRow, '2026-07-03T21:00:00Z')
    expect(update.patch.home_score).toBe(3)
    expect(update.patch.away_score).toBe(0)
    expect(update.patch.went_to_pks).toBeUndefined()
  })
})
