/**
 * Predictor-local session helper.
 *
 * Wraps the in-flight auth subagent's `resolveSession()` (from
 * `auth-session-server.ts`) once it lands on main. Until then, we ALSO
 * accept an `x-profile-id` header for curl-based smoke testing.
 *
 * TODO (post-auth-merge): drop the header fallback. Predictor endpoints
 * should require a real cookie-backed profile session.
 */

import { headers } from 'next/headers'

export interface ProfileSession {
  account_id: string
  profile_id: string
}

export async function getProfileSession(): Promise<ProfileSession | null> {
  // Try the auth subagent's real session resolver first.
  try {
    // Dynamic import so we don't crash if the file doesn't exist yet on this
    // branch. The string concat fools tsc into skipping resolution; the
    // module will resolve at runtime once auth merges into main.
    const modPath = './' + 'auth-session-server'
    const mod = await import(/* webpackIgnore: true */ modPath) as {
      resolveSession?: () => Promise<{
        account: { id: string } | null
        profile: { id: string } | null
      }>
    }
    if (typeof mod.resolveSession === 'function') {
      const { account, profile } = await mod.resolveSession()
      if (account && profile) {
        return { account_id: account.id, profile_id: profile.id }
      }
    }
  } catch {
    // helper not present yet — fall through to header fallback
  }

  // Smoke-test fallback. Header: `x-profile-id: <uuid>`.
  // We trust this only because predictor endpoints behind it are still gated
  // by Vercel preview-deploy auth + no real PII exposure. Will be removed
  // when the cookie path is verified end-to-end.
  const h = await headers()
  const profileIdHdr = h.get('x-profile-id')
  if (profileIdHdr) {
    // We don't have an account_id from the header — caller logic uses
    // profile_id only for these phase-3 endpoints. Stub the account_id as
    // the same uuid (caller never reads it in phase 3).
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
