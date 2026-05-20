/**
 * POST /api/auth/signin-tier3 — Tier 3 parent login (email + password)
 *
 * Body: { email, password }
 * Refuses if accounts.password_hash === 'PENDING_SET' (migrated accounts must
 * use Tier 1 first and then set a password via Account Settings).
 * On success: sets t90_account_id cookie ONLY (no profile yet).
 * Returns: { profiles: [...] } so the client can render the profile picker.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setAccountSession, clearProfileSession } from '@/lib/auth-cookies'
import { verifyPassword } from '@/lib/auth-crypto'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

const PENDING_SENTINEL = 'PENDING_SET'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password' },
        { status: 400 }
      )
    }

    const supabase = sb()

    const { data: account } = await supabase
      .from('accounts')
      .select('id, email, password_hash')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (!account) {
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
    }

    if (account.password_hash === PENDING_SENTINEL) {
      return NextResponse.json(
        {
          error:
            'Password not yet set for this account. Sign in with your first name + PIN, then visit Account Settings to set a password.',
          code: 'PASSWORD_PENDING',
        },
        { status: 409 }
      )
    }

    if (!verifyPassword(password, account.password_hash)) {
      // Generic message — don't leak whether email exists.
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
    }

    await setAccountSession(account.id)
    await clearProfileSession()

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, manager_name, display_name, is_owner')
      .eq('account_id', account.id)
      .is('deleted_at', null)
      .order('is_owner', { ascending: false })
      .order('created_at', { ascending: true })

    return NextResponse.json({ profiles: profiles ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
