/**
 * POST /api/auth/signin — Supabase Auth email + password sign-in.
 *
 * Body: { email, password }
 * On success:
 *   - Supabase SSR cookies (`sb-*`) are written by @supabase/ssr.
 *   - We clear any stale t90_profile_id hint cookie so the picker shows.
 * Returns: { profiles: [...] } so the client can render the profile picker.
 *
 * If the account has exactly one profile, we auto-select it and also return
 *   { profile, profiles: [the one] }
 * so the caller can skip the picker UI.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server'
import { setProfileCookie, clearProfileSession } from '@/lib/auth-cookies'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string }
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const supa = await createServerSupabase()
    const { data, error } = await supa.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    })

    if (error || !data.user) {
      // Don't leak whether the email exists.
      return NextResponse.json(
        { error: 'Incorrect email or password.' },
        { status: 401 }
      )
    }

    // Clear any stale profile hint cookie — we'll re-pick one below.
    await clearProfileSession()

    // List child profiles for this user
    const admin = createAdminSupabase()
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, first_name, manager_name, display_name, is_owner')
      .eq('account_id', data.user.id)
      .is('deleted_at', null)
      .order('is_owner', { ascending: false })
      .order('created_at', { ascending: true })

    const list = profiles ?? []

    // Auto-pick when there's only one obvious choice — keeps the existing UX
    // smooth for the 5 users who all have a single owner profile today.
    if (list.length === 1) {
      await setProfileCookie(list[0].id)
      return NextResponse.json({ profiles: list, profile: list[0] })
    }

    return NextResponse.json({ profiles: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
