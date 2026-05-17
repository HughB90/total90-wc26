/**
 * POST /api/auth/quick-signin — Tier 2 login (first_name + PIN, scoped by account_id cookie)
 * 
 * Feature flag: MULTI_PROFILE_ENABLED
 * Requires: t90_account_session cookie (set by Tier 1 or Tier 3 login)
 * Returns: { accountId, profileId, managerName, displayName }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession, setProfileSession } from '@/lib/auth-cookies'
import { verifyPin, isValidPin } from '@/lib/auth-crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Feature flag check
  if (process.env.MULTI_PROFILE_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Multi-profile auth not enabled' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json()
    const { first_name, pin } = body

    // Validation
    if (!first_name || !pin) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, pin' },
        { status: 400 }
      )
    }

    if (!isValidPin(pin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 digits' },
        { status: 400 }
      )
    }

    // 1. Get account_id from cookie
    const { accountId } = await getSession()
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'No account session found. Use full login (email + first_name + PIN) first.' },
        { status: 401 }
      )
    }

    // 2. Lookup profile by (account_id, first_name, pin_hash)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, manager_name, display_name, pin_hash')
      .eq('account_id', accountId)
      .ilike('first_name', first_name.trim())
      .is('deleted_at', null)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found in this account' },
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

    // 4. Set profile session (account session already exists)
    await setProfileSession(profile.id)

    // 5. Return session data
    return NextResponse.json({
      accountId,
      profileId: profile.id,
      managerName: profile.manager_name,
      displayName: profile.display_name || first_name,
    })

  } catch (err: any) {
    console.error('Error in /api/auth/quick-signin:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
