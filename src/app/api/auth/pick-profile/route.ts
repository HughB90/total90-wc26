/**
 * POST /api/auth/pick-profile — choose a profile after Supabase Auth sign-in.
 *
 * Requires: an active Supabase Auth session (the `sb-*` cookies).
 * Body: { profile_id }
 * On success: sets the `t90_profile_id` hint cookie.
 * Returns: { profile }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server'
import { setProfileCookie } from '@/lib/auth-cookies'

export async function POST(req: NextRequest) {
  try {
    const { profile_id } = (await req.json()) as { profile_id?: string }
    if (!profile_id) {
      return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
    }

    const supa = await createServerSupabase()
    const { data: userData } = await supa.auth.getUser()
    const userId = userData?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }

    const admin = createAdminSupabase()
    const { data: profile } = await admin
      .from('profiles')
      .select('id, first_name, last_name, manager_name, display_name, is_owner, account_id')
      .eq('id', profile_id)
      .eq('account_id', userId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found or not part of this account.' },
        { status: 404 }
      )
    }

    await setProfileCookie(profile.id)
    return NextResponse.json({
      profile: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
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
