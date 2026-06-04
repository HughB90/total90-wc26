/**
 * Server-side session resolver. The canonical source of "who are you" is now
 * Supabase Auth (cookies managed by @supabase/ssr). The profile picker stays
 * on top: a small httpOnly `t90_profile_id` cookie picks which child-profile
 * is active for the parent's account.
 *
 * Use from any route handler / server component:
 *   const { account, profile } = await resolveSession()
 *
 * Shape is intentionally identical to the pre-migration version so existing
 * call sites (predictor routes, /api/auth/me, bracket page) don't need
 * structural changes.
 */

import { createServerSupabase, createAdminSupabase } from './supabase-server'
import { getProfileCookie } from './auth-cookies'

export interface AccountRow {
  id: string
  email: string
}

export interface ProfileRow {
  id: string
  account_id: string
  first_name: string
  last_name: string | null
  manager_name: string
  display_name: string | null
  is_owner: boolean
}

export interface ResolvedSession {
  account: AccountRow | null
  profile: ProfileRow | null
}

export async function resolveSession(): Promise<ResolvedSession> {
  // 1. Get the Supabase user from the SSR-managed auth cookie.
  let userId: string | null = null
  let userEmail: string | null = null
  try {
    const supa = await createServerSupabase()
    const { data } = await supa.auth.getUser()
    if (data?.user) {
      userId = data.user.id
      userEmail = data.user.email ?? null
    }
  } catch {
    // No session / cookie tampered / Supabase unreachable — treat as anon.
  }

  if (!userId) return { account: null, profile: null }

  const account: AccountRow = { id: userId, email: userEmail ?? '' }

  // 2. Try the profile-cookie hint first.
  const profileHint = await getProfileCookie()
  const admin = createAdminSupabase()

  if (profileHint) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, account_id, first_name, last_name, manager_name, display_name, is_owner')
      .eq('id', profileHint)
      .eq('account_id', userId) // belt-and-suspenders: profile must belong to this user
      .is('deleted_at', null)
      .maybeSingle()
    if (profile) return { account, profile }
  }

  // 3. Fall back: account is signed in but no (valid) profile picked.
  //    Auto-resolve to the owner profile if there's only one obvious choice —
  //    fixes the 2026-05-20 "profile cookie expired" bug pattern.
  const { data: owner } = await admin
    .from('profiles')
    .select('id, account_id, first_name, last_name, manager_name, display_name, is_owner')
    .eq('account_id', userId)
    .is('deleted_at', null)
    .order('is_owner', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return { account, profile: owner ?? null }
}
