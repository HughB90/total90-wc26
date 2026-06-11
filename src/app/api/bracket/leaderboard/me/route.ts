/**
 * GET /api/bracket/leaderboard/me?meId=<id>[&leagueCode=ABC]
 *
 * Per-user complement to /api/bracket/leaderboard. Returns ONLY the
 * caller's rank/score. Uncached (depends on `meId`).
 *
 * `meId` may be either a profiles.id or a legacy bracket_users.id —
 * the matcher mirrors the original endpoint's behavior.
 *
 * Returns:
 *   {
 *     ok: true,
 *     scope: 'global' | 'league',
 *     leagueCode: string | null,
 *     total: number,                        // total participants
 *     me: { rank, score, total, managerName, firstName } | null
 *   }
 *
 * No `meId`: returns me=null with total still populated so callers can
 * display "of N players".
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  computeGlobalRanking,
  computeLeagueRanking,
  findMe,
} from '@/lib/bracket/leaderboard-core'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const leagueCode = searchParams.get('leagueCode')
    const meId = searchParams.get('meId') || searchParams.get('userId')

    const supabase = getSupabase()

    const result = leagueCode
      ? await computeLeagueRanking(supabase, leagueCode)
      : await computeGlobalRanking(supabase)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const ranked = result.ranked
    const total = ranked.length
    let me: { rank: number; score: number; total: number; managerName: string; firstName: string | null } | null = null

    if (meId) {
      const found = findMe(ranked, meId)
      if (found) {
        me = {
          rank: found.rank,
          score: found.score,
          total,
          managerName: found.managerName,
          firstName: found.firstName,
        }
      }
    }

    return NextResponse.json({
      ok: true,
      scope: leagueCode ? 'league' : 'global',
      leagueCode: leagueCode ?? null,
      total,
      me,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
