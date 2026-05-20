/**
 * Auth cookie utilities for Pass 2+5 multi-profile system
 *
 * Two httpOnly **signed** cookies:
 * - t90_account_id: account_id (30-day rolling) — set on any successful auth
 * - t90_profile_id: profile_id (session-lifetime) — set on profile pick
 *
 * Cookies are signed HMAC-SHA256 with AUTH_COOKIE_SECRET to prevent forgery.
 * Cookie value format: "<value>.<signature>"  (signature = base64url HMAC of value)
 *
 * Backwards compat: legacy cookie names t90_account_session / t90_profile_session
 * (unsigned) are also accepted on read. They are NOT re-written on read.
 */

import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

const ACCOUNT_COOKIE = 't90_account_id'
const PROFILE_COOKIE = 't90_profile_id'

// Legacy unsigned cookie names from the first cut of Pass 5 (still accepted on read,
// not on write). Safe to remove once we've confirmed nobody has them.
const LEGACY_ACCOUNT_COOKIE = 't90_account_session'
const LEGACY_PROFILE_COOKIE = 't90_profile_session'

// 30 days in seconds
const ACCOUNT_MAX_AGE = 30 * 24 * 60 * 60

function getSecret(): string {
  const secret = process.env.AUTH_COOKIE_SECRET
  if (!secret || secret.length < 32) {
    // Don't throw at import — throw only when used, so build still works.
    throw new Error(
      'AUTH_COOKIE_SECRET must be set to a >=32-char random string (hex(32) recommended)'
    )
  }
  return secret
}

function sign(value: string): string {
  const sig = createHmac('sha256', getSecret()).update(value).digest('base64url')
  return `${value}.${sig}`
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf('.')
  if (idx < 0) return null
  const value = signed.slice(0, idx)
  const sig = signed.slice(idx + 1)
  let expected: Buffer
  try {
    expected = Buffer.from(
      createHmac('sha256', getSecret()).update(value).digest('base64url')
    )
  } catch {
    return null
  }
  const provided = Buffer.from(sig)
  if (expected.length !== provided.length) return null
  if (!timingSafeEqual(expected, provided)) return null
  return value
}

export interface SessionData {
  accountId: string | null
  profileId: string | null
}

/**
 * Get current session from cookies. Returns nulls for missing or tampered cookies.
 * Also honors the (unsigned) legacy cookie names for the few in-flight clients.
 */
export async function getSession(): Promise<SessionData> {
  const cookieStore = await cookies()

  const signedAccount = cookieStore.get(ACCOUNT_COOKIE)?.value
  const signedProfile = cookieStore.get(PROFILE_COOKIE)?.value

  let accountId = signedAccount ? unsign(signedAccount) : null
  let profileId = signedProfile ? unsign(signedProfile) : null

  // Legacy fallback (unsigned). Used by clients that still have an old cookie set
  // from the first Pass 5 cut. They will be migrated next time they sign in.
  if (!accountId) {
    const legacy = cookieStore.get(LEGACY_ACCOUNT_COOKIE)?.value
    if (legacy) accountId = legacy
  }
  if (!profileId) {
    const legacy = cookieStore.get(LEGACY_PROFILE_COOKIE)?.value
    if (legacy) profileId = legacy
  }

  return { accountId, profileId }
}

export async function setAccountSession(accountId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACCOUNT_COOKIE, sign(accountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ACCOUNT_MAX_AGE,
    path: '/',
  })
}

export async function setProfileSession(profileId: string) {
  const cookieStore = await cookies()
  cookieStore.set(PROFILE_COOKIE, sign(profileId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

export async function clearSessions() {
  const cookieStore = await cookies()
  cookieStore.delete(ACCOUNT_COOKIE)
  cookieStore.delete(PROFILE_COOKIE)
  cookieStore.delete(LEGACY_ACCOUNT_COOKIE)
  cookieStore.delete(LEGACY_PROFILE_COOKIE)
}

export async function clearProfileSession() {
  const cookieStore = await cookies()
  cookieStore.delete(PROFILE_COOKIE)
  cookieStore.delete(LEGACY_PROFILE_COOKIE)
}
