/**
 * POST /api/auth/pick-profile — choose a profile after Tier 3 login.
 *
 * Requires: t90_account_id cookie.
 * Body: { profile_id }
 * On success: sets t90_profile_id cookie.
 * Returns: { profile }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession, setProfileSession } from '@/lib/auth-cookies'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

export async function POST(req: NextRequest) {
  try {
    const { profile_id } = (await req.json()) as { profile_id?: string }
    if (!profile_id) {
      return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
    }

    const { accountId } = await getSession()
    if (!accountId) {
      return NextResponse.json({ error: 'No account session.' }, { status: 401 })
    }

    const { data: profile } = await sb()
      .from('profiles')
      .select('id, first_name, manager_name, display_name, is_owner, account_id')
      .eq('id', profile_id)
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found or not part of this account.' },
        { status: 404 }
      )
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
