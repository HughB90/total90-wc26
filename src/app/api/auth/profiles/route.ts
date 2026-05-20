/**
 * GET /api/auth/profiles — List all profiles for current account
 * POST /api/auth/profiles — Create new profile (requires account session)
 * 
 * Feature flag: MULTI_PROFILE_ENABLED
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/auth-cookies'
import { hashPin, isValidPin } from '@/lib/auth-crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_PROFILES_PER_ACCOUNT = 6

/**
 * GET — List all profiles for current account
 */
export async function GET(req: NextRequest) {
  try {
    // Require account session
    const { accountId } = await getSession()
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Fetch profiles for this account
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, first_name, manager_name, display_name, is_owner, created_at')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('is_owner', { ascending: false })  // Owner first
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching profiles:', error)
      return NextResponse.json(
        { error: 'Failed to fetch profiles' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      profiles: profiles || []
    })

  } catch (err: any) {
    console.error('Error in GET /api/auth/profiles:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST — Create new profile (requires account session)
 */
export async function POST(req: NextRequest) {
  try {
    // Require account session
    const { accountId } = await getSession()
    
    if (!accountId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { first_name, pin, manager_name, display_name } = body

    // Validation
    if (!first_name || !pin || !manager_name) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, pin, manager_name' },
        { status: 400 }
      )
    }

    if (!isValidPin(pin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 digits' },
        { status: 400 }
      )
    }

    // Check profile count limit
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .is('deleted_at', null)

    if (countError) {
      console.error('Error counting profiles:', countError)
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

    // Check for collision: (account_id, first_name, pin_hash) must be unique
    const pinHash = hashPin(pin)
    
    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
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

    // Create profile
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        account_id: accountId,
        first_name: first_name.trim(),
        pin_hash: pinHash,
        manager_name: manager_name.trim(),
        display_name: display_name?.trim() || null,
        is_owner: false,  // Only migration creates owner profiles
      })
      .select('id, first_name, manager_name, display_name')
      .single()

    if (createError) {
      console.error('Error creating profile:', createError)
      return NextResponse.json(
        { error: 'Failed to create profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      profile: newProfile
    }, { status: 201 })

  } catch (err: any) {
    console.error('Error in POST /api/auth/profiles:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
