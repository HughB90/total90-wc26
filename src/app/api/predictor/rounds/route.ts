/**
 * GET /api/predictor/rounds
 *
 * Returns the 8-round config from src/lib/predictor-rounds.ts, plus
 * the per-round status flags for the current profile (submitted? locked?
 * in-progress?). Anon callers get the config without status flags.
 */

import { NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import { PREDICTOR_ROUNDS, isRoundLocked } from '@/lib/predictor-rounds'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getProfileSession()

  // Build per-round base config + lock state (server clock = source of truth).
  const base = PREDICTOR_ROUNDS.map((r) => ({
    ...r,
    locked: isRoundLocked(r),
  }))

  if (!session) {
    return NextResponse.json({
      rounds: base.map((r) => ({ ...r, my_picks: 0, status: r.locked ? 'locked' : 'open' })),
    })
  }

  const sb = predictorAdmin()

  // Pull all match_id -> round_code mapping in one shot, then count picks by round.
  const { data: matches } = await sb
    .from('predictor_matches')
    .select('id, round_code')

  const matchToRound = new Map<string, string>()
  for (const m of (matches ?? []) as Array<{ id: string; round_code: string }>) {
    matchToRound.set(m.id, m.round_code)
  }

  const { data: picks } = await sb
    .from('predictor_picks')
    .select('match_id')
    .eq('profile_id', session.profile_id)

  const pickCountByRound = new Map<string, number>()
  for (const p of (picks ?? []) as Array<{ match_id: string }>) {
    const r = matchToRound.get(p.match_id)
    if (!r) continue
    pickCountByRound.set(r, (pickCountByRound.get(r) ?? 0) + 1)
  }

  const rounds = base.map((r) => {
    const my_picks = pickCountByRound.get(r.code) ?? 0
    let status: 'open' | 'locked' | 'submitted' | 'in-progress'
    if (r.locked) {
      status = my_picks > 0 ? 'submitted' : 'locked'
    } else if (my_picks >= r.required) {
      status = 'submitted'
    } else if (my_picks > 0) {
      status = 'in-progress'
    } else {
      status = 'open'
    }
    return { ...r, my_picks, status }
  })

  return NextResponse.json({ rounds })
}
