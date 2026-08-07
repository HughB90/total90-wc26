/**
 * POST /api/predictor/winner   — submit winner pick (ONE-SHOT for late entries)
 * GET  /api/predictor/winner   — current profile's pick (or null)
 *
 * Locks:
 *   - Pre-tournament: anyone can submit/update freely BEFORE R1 kickoff
 *     (2026-06-11 19:00 UTC). Pre-kickoff updates are not "late" — the
 *     row's days_late/bonus_cap stay 0/40.
 *   - Post-tournament-start (Jun 11 14:00 CT onwards):
 *       * A user with NO existing pick can submit a fresh one. We compute
 *         and LOCK days_late, bonus_cap, penalty_pts based on Date.now()
 *         in America/Chicago at the moment of submission.
 *       * A user WITH an existing pick gets 403 (`winner_pick_already_set`).
 *         Hugh's spec: late entrants get exactly one shot at picking, then
 *         it's locked forever — no edits afterwards.
 *   - Tournament finalized (Final match has both scores): 403 for everyone.
 *     We derive this from predictor_matches (round_code='final', status='final',
 *     both scores non-null) rather than a separate settings table.
 *
 * Backward compat:
 *   GET response shape gains days_late / bonus_cap / penalty_pts. Older
 *   clients reading only team_code keep working.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession, WINNER_PICK_LOCK_ISO } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import { computeWinnerPenalty, FULL_BONUS_PTS } from '@/lib/predictor/winner-penalty'

export const dynamic = 'force-dynamic'

/**
 * Has the WC Final already been decided? If yes, no more winner picks
 * from anyone — late entry window is closed.
 */
async function isTournamentFinalized(sb: ReturnType<typeof predictorAdmin>): Promise<boolean> {
  const { data } = await sb
    .from('predictor_matches')
    .select('id')
    .eq('round_code', 'final')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)
    .limit(2)
  // Round code 'final' covers both Final + 3rd Place playoff (2 matches).
  // The tournament is "done" once at least the actual Final has been
  // finalized. We approximate: both rows present (Final + 3rd place) AND
  // both have scores. If only one of two: still mid-final-day, keep open.
  return Array.isArray(data) && data.length >= 2
}

export async function GET() {
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ pick: null }, { status: 200 })

  const sb = predictorAdmin()
  const { data, error } = await sb
    .from('predictor_winner_picks')
    .select('team_code, submitted_at, updated_at, days_late, bonus_cap, penalty_pts')
    .eq('profile_id', session.profile_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pick: data ?? null })
}

export async function POST(req: NextRequest) {
  const session = await getProfileSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const sb = predictorAdmin()

  // Tournament-end hard lock — applies to everyone, regardless of late status.
  if (await isTournamentFinalized(sb)) {
    return NextResponse.json({ error: 'tournament_finalized' }, { status: 403 })
  }

  // Pre-tournament window check (mirrors lib helper).
  const now = new Date()
  const isPreKickoff = now.getTime() < new Date(WINNER_PICK_LOCK_ISO).getTime()

  // Existing pick? Determines whether we allow update (pre-kickoff only)
  // or refuse (post-kickoff = late entry already used).
  const { data: existing, error: existErr } = await sb
    .from('predictor_winner_picks')
    .select('team_code, days_late, bonus_cap, penalty_pts')
    .eq('profile_id', session.profile_id)
    .maybeSingle()
  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 })

  // Post-kickoff: existing pick = no more changes allowed.
  if (existing && !isPreKickoff) {
    return NextResponse.json(
      {
        error: 'winner_pick_already_set',
        pick: existing,
      },
      { status: 403 },
    )
  }

  // Parse + validate body.
  let body: { team_code?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const teamCode = typeof body.team_code === 'string' ? body.team_code.trim() : ''
  if (!teamCode) {
    return NextResponse.json({ error: 'team_code_required' }, { status: 400 })
  }

  // Lock the penalty trio at SAVE time.
  // Pre-kickoff submissions: 0/40/0 regardless of when in the pre-kickoff window.
  // Post-kickoff submissions: computed from CT calendar days late.
  let lockedDaysLate = 0
  let lockedBonusCap = FULL_BONUS_PTS
  let lockedPenaltyPts = 0
  if (!isPreKickoff) {
    const penalty = computeWinnerPenalty(now)
    lockedDaysLate = penalty.daysLate
    lockedBonusCap = penalty.bonusCap
    lockedPenaltyPts = penalty.penaltyPts
  }

  // First-save semantics: write penalty fields only when there's no existing
  // row, OR when existing row is pre-kickoff (still 0/40/0) and we're still
  // pre-kickoff (allow team swap with no penalty). The penalty math is
  // LOCKED on whichever save actually inserts non-zero values.
  const upsertRow: {
    profile_id: string
    team_code: string
    days_late?: number
    bonus_cap?: number
    penalty_pts?: number
  } = {
    profile_id: session.profile_id,
    team_code: teamCode,
  }
  if (!existing) {
    // First-ever save for this profile — write the lockable trio.
    upsertRow.days_late = lockedDaysLate
    upsertRow.bonus_cap = lockedBonusCap
    upsertRow.penalty_pts = lockedPenaltyPts
  }
  // else: existing pre-kickoff row + we're still pre-kickoff → only update
  // team_code, leave days_late/bonus_cap/penalty_pts alone (they're 0/40/0).

  const { data, error } = await sb
    .from('predictor_winner_picks')
    .upsert(upsertRow, { onConflict: 'profile_id' })
    .select('team_code, submitted_at, updated_at, days_late, bonus_cap, penalty_pts')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pick: data })
}
