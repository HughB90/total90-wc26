/**
 * GET /api/scores
 *
 * Public, anonymous. Returns all 104 WC26 fixtures from `predictor_matches`
 * ordered by `match_num` for the /scores page (and any other surface that
 * wants the live schedule).
 *
 * Cache: edge cache for 15s, stale-while-revalidate for 60s. The page
 * additionally polls every 30s while any match is in-play, so end-to-end
 * latency from Opta → user is ~45–90s worst case during live windows.
 *
 * Response 200:
 *   {
 *     ok: true,
 *     fetched_at: ISO,
 *     count: int,
 *     matches: [
 *       {
 *         id, match_num, round_code, group_code,
 *         home_team_code, away_team_code, kickoff_at, venue,
 *         home_score, away_score, status, period, minute,
 *         is_knockout, went_to_pks, pk_winner_team_code,
 *         goalscorers, last_synced_at
 *       },
 *       ...
 *     ]
 *   }
 */

import { NextResponse } from 'next/server'
import { predictorAdmin } from '@/lib/predictor-db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SELECT_COLS = [
  'id',
  'match_num',
  'round_code',
  'group_code',
  'home_team_code',
  'away_team_code',
  'kickoff_at',
  'venue',
  'home_score',
  'away_score',
  'status',
  'period',
  'minute',
  'is_knockout',
  'went_to_pks',
  'pk_winner_team_code',
  'goalscorers',
  'last_synced_at',
].join(', ')

export async function GET() {
  try {
    const sb = predictorAdmin()
    const { data, error } = await sb
      .from('predictor_matches')
      .select(SELECT_COLS)
      .order('match_num', { ascending: true })

    if (error) {
      console.error('[api/scores] db error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        ok: true,
        fetched_at: new Date().toISOString(),
        count: data?.length ?? 0,
        matches: data ?? [],
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=15, stale-while-revalidate=60',
        },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[api/scores] unexpected:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
