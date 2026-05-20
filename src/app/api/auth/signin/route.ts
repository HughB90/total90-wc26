/**
 * POST /api/auth/signin — Tier 1 login (email + first_name + PIN)
 * 
 * Feature flag: MULTI_PROFILE_ENABLED
 * Returns: { accountId, profileId, managerName, displayName }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setAccountSession, setProfileSession } from '@/lib/auth-cookies'
import { verifyPin, isValidPin } from '@/lib/auth-crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // NOTE: legacy endpoint, kept alive for the orphan /auth/signin page.
  // Canonical surface is /api/auth/signin-tier1. Same behaviour.
  try {
    const body = await req.json()
    const { email, first_name, pin } = body

    // Validation
    if (!email || !first_name || !pin) {
      return NextResponse.json(
        { error: 'Missing required fields: email, first_name, pin' },
        { status: 400 }
      )
    }

    if (!isValidPin(pin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 digits' },
        { status: 400 }
      )
    }

    // 1. Lookup account by email
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 401 }
      )
    }

    // 2. Lookup profile by (account_id, first_name, pin_hash)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, manager_name, display_name, pin_hash')
      .eq('account_id', account.id)
      .ilike('first_name', first_name.trim())
      .is('deleted_at', null)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 401 }
      )
    }

    // 3. Verify PIN
    if (!verifyPin(pin, profile.pin_hash)) {
      return NextResponse.json(
        { error: 'Incorrect PIN' },
        { status: 401 }
      )
    }

    // 4. Set sessions
    await setAccountSession(account.id)
    await setProfileSession(profile.id)

    // 5. Return session data
    return NextResponse.json({
      accountId: account.id,
      profileId: profile.id,
      managerName: profile.manager_name,
      displayName: profile.display_name || first_name,
    })

  } catch (err: any) {
    console.error('Error in /api/auth/signin:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
