/**
 * GET  /api/auth/profiles — list all profiles for the current Supabase user
 * POST /api/auth/profiles — create a new child profile under the current user
 *
 * Auth: requires a Supabase Auth session (the `sb-*` cookies).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server'
import { hashPin, isValidPin } from '@/lib/auth-crypto'

const MAX_PROFILES_PER_ACCOUNT = 6

async function getUserId(): Promise<string | null> {
  const supa = await createServerSupabase()
  const { data } = await supa.auth.getUser()
  return data?.user?.id ?? null
}

export async function GET() {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = createAdminSupabase()
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, first_name, manager_name, display_name, is_owner, created_at')
      .eq('account_id', userId)
      .is('deleted_at', null)
      .order('is_owner', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching profiles:', error)
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
    }

    return NextResponse.json({ profiles: profiles ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { first_name, pin, manager_name, display_name, is_owner: wantOwner } = body as {
      first_name?: string
      pin?: string
      manager_name?: string
      display_name?: string
      is_owner?: boolean
    }

    if (!first_name || !manager_name) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, manager_name' },
        { status: 400 }
      )
    }

    const admin = createAdminSupabase()

    // Count guard
    const { count, error: countError } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', userId)
      .is('deleted_at', null)

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to check profile limit' },
        { status: 500 }
      )
    }
    if (count && count >= MAX_PROFILES_PER_ACCOUNT) {
      return NextResponse.json(
        { error: `Maximum ${MAX_PROFILES_PER_ACCOUNT} profiles per account` },
        { status: 400 }
      )
    }

    // Owner profile: only allowed when the account has zero existing profiles.
    // Owner profile does NOT require a PIN (parent signs in via email+password).
    // Child profiles ALWAYS require a 4-digit PIN.
    const isFirstProfile = !count || count === 0
    const isOwner = Boolean(wantOwner) && isFirstProfile

    if (!isOwner) {
      if (!pin) {
        return NextResponse.json(
          { error: 'PIN is required for child profiles.' },
          { status: 400 }
        )
      }
      if (!isValidPin(pin)) {
        return NextResponse.json(
          { error: 'PIN must be exactly 4 digits' },
          { status: 400 }
        )
      }
    }

    // Owner profiles get an auto-generated PIN (pin_hash is NOT NULL in DB).
    // Parent signs in via email+password; PIN can be exposed later for kid
    // quick-switch UI inside the account.
    let effectivePin = pin
    if (!effectivePin && isOwner) {
      effectivePin = String(Math.floor(1000 + Math.random() * 9000))
    }
    if (!effectivePin || !isValidPin(effectivePin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 digits' },
        { status: 400 }
      )
    }
    const pinHash = hashPin(effectivePin)

    // Collision rule: (account_id, first_name, pin_hash) unique.
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('account_id', userId)
      .ilike('first_name', first_name.trim())
      .eq('pin_hash', pinHash)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'A profile with this name and PIN already exists in your account' },
        { status: 409 }
      )
    }

    const { data: newProfile, error: createError } = await admin
      .from('profiles')
      .insert({
        account_id: userId,
        first_name: first_name.trim(),
        pin_hash: pinHash,
        manager_name: manager_name.trim(),
        display_name: display_name?.trim() || null,
        is_owner: isOwner,
      })
      .select('id, first_name, manager_name, display_name, is_owner')
      .single()

    if (createError) {
      console.error('Error creating profile:', createError)
      return NextResponse.json(
        { error: 'Failed to create profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({ profile: newProfile }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
