import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { email, display_name, pin, invite_code } = await request.json() as {
      email: string
      display_name: string
      pin: string
      invite_code?: string
    }

    if (!email || !display_name || !pin) {
      return NextResponse.json({ error: 'Email, display name, and PIN required' }, { status: 400 })
    }
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const pinHash = crypto.createHash('sha256').update(pin).digest('hex')
    const normalizedEmail = email.trim().toLowerCase()

    // Check if user exists
    const { data: existing } = await supabase
      .from('bracket_users')
      .select('id, display_name, pin_hash')
      .eq('email', normalizedEmail)
      .single()

    let userId: string
    let resolvedName: string

    if (existing) {
      // Verify PIN
      if (existing.pin_hash !== pinHash) {
        return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
      }
      userId = existing.id
      resolvedName = existing.display_name
    } else {
      // Create new user
      const { data: created, error: insertError } = await supabase
        .from('bracket_users')
        .insert({
          email: normalizedEmail,
          display_name: display_name.trim(),
          pin_hash: pinHash,
        })
        .select('id, display_name')
        .single()

      if (insertError || !created) {
        return NextResponse.json({ error: insertError?.message ?? 'Failed to create user' }, { status: 500 })
      }
      userId = created.id
      resolvedName = created.display_name
    }

    // Handle invite code
    if (invite_code) {
      const { data: league } = await supabase
        .from('bracket_leagues')
        .select('id')
        .eq('invite_code', invite_code.toUpperCase())
        .single()

      if (league) {
        await supabase
          .from('bracket_league_members')
          .upsert({ league_id: league.id, user_id: userId }, { onConflict: 'league_id,user_id' })
      }
    }

    return NextResponse.json({ ok: true, userId, displayName: resolvedName })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
