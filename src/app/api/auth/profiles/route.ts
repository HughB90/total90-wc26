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
      .select('id, first_name, last_name, manager_name, display_name, is_owner, created_at')
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
    const {
      first_name,
      last_name,
      pin,
      manager_name,
      display_name,
      is_owner: wantOwner,
    } = body as {
      first_name?: string
      last_name?: string
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
    // last_name is required for any new profile created via this endpoint
    // (added 2026-06-04). Existing rows remain blank — we don't backfill or
    // nag — but every fresh insert must carry one.
    if (!last_name || !last_name.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: last_name' },
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

    // Owner = first profile under this account. is_owner flag is client-asserted
    // but only honored when no other profiles exist.
    const isFirstProfile = !count || count === 0
    const isOwner = Boolean(wantOwner) && isFirstProfile

    // PINs are no longer required at create time (Hugh's call 2026-05-21).
    // pin_hash is still NOT NULL in the DB schema, so we auto-generate a
    // random 4-digit PIN per profile. Kept around for a future kid-quick-
    // switch challenge UI — but the create flow never asks for it.
    const effectivePin =
      pin && isValidPin(pin) ? pin : String(Math.floor(1000 + Math.random() * 9000))
    const pinHash = hashPin(effectivePin)

    // Collision rule: (account_id, first_name) unique within an account so
    // the dropdown doesn't show two 'Lucas' entries. PIN is no longer part
    // of the uniqueness check.
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('account_id', userId)
      .ilike('first_name', first_name.trim())
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'A profile with that first name already exists on this account.' },
        { status: 409 }
      )
    }

    const { data: newProfile, error: createError } = await admin
      .from('profiles')
      .insert({
        account_id: userId,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        pin_hash: pinHash,
        manager_name: manager_name.trim(),
        display_name: display_name?.trim() || null,
        is_owner: isOwner,
      })
      .select('id, first_name, last_name, manager_name, display_name, is_owner')
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
