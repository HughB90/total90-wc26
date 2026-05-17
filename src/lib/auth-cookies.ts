/**
 * Auth cookie utilities for Pass 5 multi-profile system
 * 
 * Two httpOnly cookies:
 * - t90_account_session: account_id (30-day rolling)
 * - t90_profile_session: profile_id (session-lifetime, expires on browser close)
 */

import { cookies } from 'next/headers'

const ACCOUNT_COOKIE = 't90_account_session'
const PROFILE_COOKIE = 't90_profile_session'

// 30 days in seconds
const ACCOUNT_MAX_AGE = 30 * 24 * 60 * 60

export interface SessionData {
  accountId: string | null
  profileId: string | null
}

/**
 * Get current session from cookies
 */
export async function getSession(): Promise<SessionData> {
  const cookieStore = await cookies()
  
  return {
    accountId: cookieStore.get(ACCOUNT_COOKIE)?.value ?? null,
    profileId: cookieStore.get(PROFILE_COOKIE)?.value ?? null,
  }
}

/**
 * Set account session cookie (30-day rolling)
 */
export async function setAccountSession(accountId: string) {
  const cookieStore = await cookies()
  
  cookieStore.set(ACCOUNT_COOKIE, accountId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ACCOUNT_MAX_AGE,
    path: '/',
  })
}

/**
 * Set profile session cookie (session-lifetime, no max-age = expires on browser close)
 */
export async function setProfileSession(profileId: string) {
  const cookieStore = await cookies()
  
  cookieStore.set(PROFILE_COOKIE, profileId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

/**
 * Clear both session cookies
 */
export async function clearSessions() {
  const cookieStore = await cookies()
  
  cookieStore.delete(ACCOUNT_COOKIE)
  cookieStore.delete(PROFILE_COOKIE)
}

/**
 * Clear only profile session (keep account session for profile picker)
 */
export async function clearProfileSession() {
  const cookieStore = await cookies()
  
  cookieStore.delete(PROFILE_COOKIE)
}
