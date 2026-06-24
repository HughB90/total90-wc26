/**
 * Email preferences — server-side helpers.
 *
 * `canEmail(accountId, type)` returns false if:
 *   - the account has unsub_all = true, OR
 *   - the specific type's pref flag is false.
 *
 * Type strings follow a `category[:subtype]` convention. We map the prefix
 * to the boolean column in `email_prefs`. Unknown types default to allowed
 * (so transactional / one-off blasts ship unless explicitly toggled).
 *
 * Note: `welcome` and `bracket_magic_link` are treated specially in
 * `sendEmail()` — see send.ts.
 */

import { createAdminSupabase } from '@/lib/supabase-server'

export type EmailPrefs = {
  account_id: string
  unsub_token: string
  round_reminders: boolean
  league_invites: boolean
  winner_lock: boolean
  marketing: boolean
  unsub_all: boolean
}

/** Map a type string → the boolean column in email_prefs that gates it. */
export function prefColumnForType(type: string): keyof EmailPrefs | null {
  const category = type.split(':')[0]
  switch (category) {
    case 'round_reminder':
    case 'round_reminders':
      return 'round_reminders'
    case 'league_invite':
    case 'league_invites':
      return 'league_invites'
    case 'winner_lock':
      return 'winner_lock'
    case 'marketing':
      return 'marketing'
    default:
      return null
  }
}

export async function getPrefsByAccountId(accountId: string): Promise<EmailPrefs | null> {
  const admin = createAdminSupabase()
  const { data } = await admin
    .from('email_prefs')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()
  return (data as EmailPrefs | null) ?? null
}

export async function getPrefsByToken(token: string): Promise<EmailPrefs | null> {
  const admin = createAdminSupabase()
  const { data } = await admin
    .from('email_prefs')
    .select('*')
    .eq('unsub_token', token)
    .maybeSingle()
  return (data as EmailPrefs | null) ?? null
}

/** Ensure the account has a prefs row, return it. */
export async function ensurePrefs(accountId: string): Promise<EmailPrefs | null> {
  const existing = await getPrefsByAccountId(accountId)
  if (existing) return existing
  const admin = createAdminSupabase()
  const { data } = await admin
    .from('email_prefs')
    .insert({ account_id: accountId })
    .select('*')
    .maybeSingle()
  return (data as EmailPrefs | null) ?? null
}

/**
 * Returns true if we are allowed to send `type` to `accountId`.
 * If accountId is null/undefined (no recipient on file), returns true — caller
 * is sending to a raw email and we can't gate without a prefs row.
 */
export async function canEmail(
  accountId: string | null | undefined,
  type: string
): Promise<{ allowed: boolean; prefs: EmailPrefs | null; reason?: string }> {
  if (!accountId) {
    return { allowed: true, prefs: null }
  }

  const prefs = await ensurePrefs(accountId)
  if (!prefs) {
    // No prefs row and we couldn't create one — fail open (transactional safety).
    return { allowed: true, prefs: null, reason: 'no_prefs_row' }
  }

  if (prefs.unsub_all) {
    return { allowed: false, prefs, reason: 'unsub_all' }
  }

  const col = prefColumnForType(type)
  if (col && col in prefs && (prefs as Record<string, unknown>)[col] === false) {
    return { allowed: false, prefs, reason: `pref_${col}_false` }
  }

  return { allowed: true, prefs }
}
