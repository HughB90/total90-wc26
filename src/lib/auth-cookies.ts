/**
 * Profile-cookie helpers.
 *
 * The "account" cookie no longer exists — Supabase Auth (`@supabase/ssr`)
 * owns the parent-account session via its own `sb-*` cookies.
 *
 * `t90_profile_id` is an httpOnly hint cookie that records which child profile
 * the parent picked. It's just a UUID hint; the server always cross-checks
 * `profiles.account_id === auth.user.id` before honoring it, so signing it
 * adds no real security. We keep it unsigned but httpOnly.
 *
 * 30-day maxAge so it survives browser restart (the bug we hit on 2026-05-20).
 *
 * Legacy: the old signed `t90_account_id` / `t90_profile_id` and unsigned
 * `t90_account_session` / `t90_profile_session` cookies will linger in
 * existing browsers for a while. They are silently ignored on read (the
 * Supabase session cookie now decides who you are); on the next sign-in they
 * get overwritten / cleared.
 */

import { cookies } from 'next/headers'

const PROFILE_COOKIE = 't90_profile_id'

// Legacy names — we proactively clear them on signout so they don't haunt us.
const LEGACY_COOKIE_NAMES = [
  't90_account_id',
  't90_account_session',
  't90_profile_session',
]

const PROFILE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export async function getProfileCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(PROFILE_COOKIE)?.value ?? null
}

export async function setProfileCookie(profileId: string) {
  const cookieStore = await cookies()
  cookieStore.set(PROFILE_COOKIE, profileId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PROFILE_MAX_AGE,
    path: '/',
  })
}

export async function clearProfileCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(PROFILE_COOKIE)
  for (const name of LEGACY_COOKIE_NAMES) cookieStore.delete(name)
}

// Backwards-compat aliases for the older call sites. The "account" cookie is
// now controlled by Supabase, so these are no-ops at the cookie layer — they
// exist so we don't have to rewrite every signin/signout call site at once.
export async function setProfileSession(profileId: string) {
  await setProfileCookie(profileId)
}

export async function clearProfileSession() {
  const cookieStore = await cookies()
  cookieStore.delete(PROFILE_COOKIE)
}

export async function clearSessions() {
  await clearProfileCookie()
}
