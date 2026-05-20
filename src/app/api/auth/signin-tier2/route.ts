/**
 * POST /api/auth/signin-tier2 — Tier 2 quick login (first_name + PIN)
 *
 * Requires: t90_account_id cookie (from prior Tier 1 / Tier 3 login).
 * Body: { first_name, pin }
 * On success: sets t90_profile_id cookie.
 * Returns: { profile }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession, setProfileSession } from '@/lib/auth-cookies'
import { verifyPin, isValidPin } from '@/lib/auth-crypto'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

export async function POST(req: NextRequest) {
  try {
    const { first_name, pin } = (await req.json()) as { first_name?: string; pin?: string }

    if (!first_name || !pin) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, pin' },
        { status: 400 }
      )
    }
    if (!isValidPin(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
    }

    const { accountId } = await getSession()
    if (!accountId) {
      return NextResponse.json(
        { error: 'No account session. Sign in with email + first name + PIN first.' },
        { status: 401 }
      )
    }

    const supabase = sb()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, manager_name, display_name, is_owner, pin_hash')
      .eq('account_id', accountId)
      .ilike('first_name', first_name.trim())
      .is('deleted_at', null)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'No profile with that first name.' }, { status: 401 })
    }
    if (!verifyPin(pin, profile.pin_hash)) {
      return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
    }

    await setProfileSession(profile.id)

    return NextResponse.json({
      profile: {
        id: profile.id,
        first_name: profile.first_name,
        manager_name: profile.manager_name,
        display_name: profile.display_name,
        is_owner: profile.is_owner,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
