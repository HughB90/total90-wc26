/**
 * Server-side session resolver. Reads signed cookies (via auth-cookies.ts)
 * and looks up the account + profile from Supabase.
 *
 * Use from any route handler / server component:
 *   const { account, profile } = await resolveSession()
 */

import { createClient } from '@supabase/supabase-js'
import { getSession } from './auth-cookies'

export interface AccountRow {
  id: string
  email: string
}

export interface ProfileRow {
  id: string
  account_id: string
  first_name: string
  manager_name: string
  display_name: string | null
  is_owner: boolean
}

export interface ResolvedSession {
  account: AccountRow | null
  profile: ProfileRow | null
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function resolveSession(): Promise<ResolvedSession> {
  const { accountId, profileId } = await getSession()
  if (!accountId) return { account: null, profile: null }

  const sb = adminClient()

  const { data: account } = await sb
    .from('accounts')
    .select('id, email')
    .eq('id', accountId)
    .maybeSingle()

  if (!account) return { account: null, profile: null }
  if (!profileId) return { account, profile: null }

  const { data: profile } = await sb
    .from('profiles')
    .select('id, account_id, first_name, manager_name, display_name, is_owner')
    .eq('id', profileId)
    .eq('account_id', accountId) // belt-and-suspenders: never trust the profile cookie alone
    .is('deleted_at', null)
    .maybeSingle()

  return { account, profile: profile ?? null }
}
