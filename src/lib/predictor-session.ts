/**
 * Predictor-local session helper. Reads the canonical signed-cookie session
 * via auth-session-server.resolveSession(). Header fallback (x-profile-id)
 * kept for smoke-test parity in dev/curl only.
 */

import { headers } from 'next/headers'
import { resolveSession } from './auth-session-server'

export interface ProfileSession {
  account_id: string
  profile_id: string
}

export async function getProfileSession(): Promise<ProfileSession | null> {
  try {
    const { account, profile } = await resolveSession()
    if (account && profile) {
      return { account_id: account.id, profile_id: profile.id }
    }
  } catch {
    // fall through to header fallback below
  }

  // Dev/curl smoke-test fallback only. Header: `x-profile-id: <uuid>`.
  const h = await headers()
  const profileIdHdr = h.get('x-profile-id')
  if (profileIdHdr) {
    return { account_id: profileIdHdr, profile_id: profileIdHdr }
  }

  return null
}

// Hard lock for the pre-tournament winner pick: R1 first kickoff.
// 2026-06-11 14:00 CT = 2026-06-11 19:00 UTC (CDT = UTC-5).
export const WINNER_PICK_LOCK_ISO = '2026-06-11T19:00:00.000Z'

export function isWinnerPickLocked(now = new Date()): boolean {
  return now.getTime() >= new Date(WINNER_PICK_LOCK_ISO).getTime()
}
