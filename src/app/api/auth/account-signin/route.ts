/**
 * POST /api/auth/account-signin — Tier 3 login (email + password, no profile yet)
 * 
 * Feature flag: MULTI_PROFILE_ENABLED
 * Returns: { accountId } (no profileId — user should land on profile picker)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setAccountSession, clearProfileSession } from '@/lib/auth-cookies'
import { verifyPassword } from '@/lib/auth-crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // NOTE: legacy endpoint, kept alive for /auth/account-signin page.
  // Canonical surface is /api/auth/signin-tier3 (which also rejects PENDING_SET).
  try {
    const body = await req.json()
    const { email, password } = body

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password' },
        { status: 400 }
      )
    }

    // 1. Lookup account by email
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 401 }
      )
    }

    // 2. Verify password
    if (!verifyPassword(password, account.password_hash)) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      )
    }

    // 3. Set account session only (clear any existing profile session)
    await setAccountSession(account.id)
    await clearProfileSession()

    // 4. Return account ID (frontend should redirect to profile picker)
    return NextResponse.json({
      accountId: account.id,
    })

  } catch (err: any) {
    console.error('Error in /api/auth/account-signin:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
