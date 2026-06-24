import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendEmail } from '@/lib/email/send'

// LEGACY: bracket_users-based auth. Pre-dates both the bespoke accounts table
// and the current Supabase Auth unification. Still alive because the old
// bracket page on prior deploys POSTs here. Returns user identity but does
// NOT set a session cookie — the Supabase Auth flow is now the only way to
// actually sign in for cookie-based access.
async function upgradeLegacyClient(_supabase: unknown, _bracketUserId: string) {
  // no-op since 2026-05-20 (Supabase Auth unification)
}

async function sendWelcomeEmail(email: string, displayName: string, pin: string) {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0A0F2E;color:#F0F4FF;padding:2rem;border-radius:1rem;">
      <img src="https://wc26.total90.com/total90-logo-green.png" alt="Total90" style="width:48px;height:48px;display:block;margin:0 auto 1rem;" />
      <h1 style="color:#FBBF24;text-align:center;font-size:1.4rem;margin:0 0 0.5rem;">Welcome to the Bracket Challenge!</h1>
      <p style="text-align:center;color:#8899CC;margin:0 0 2rem;">World Cup 2026 · Make your picks</p>

      <div style="background:#0F1C4D;border:1px solid #1E3A6E;border-radius:0.875rem;padding:1.5rem;margin-bottom:1.5rem;">
        <p style="margin:0 0 0.5rem;color:#8899CC;font-size:0.85rem;">YOUR LOGIN DETAILS</p>
        <p style="margin:0 0 0.75rem;"><strong style="color:#F0F4FF;">Team Name:</strong> <span style="color:#FBBF24;font-weight:700;">${displayName}</span></p>
        <p style="margin:0;"><strong style="color:#F0F4FF;">PIN:</strong> <span style="color:#FBBF24;font-weight:700;letter-spacing:0.2em;">${pin}</span></p>
      </div>

      <p style="text-align:center;color:#8899CC;font-size:0.85rem;margin:0 0 1rem;">Save this email — it's the only place your PIN is stored.</p>

      <a href="https://wc26.total90.com/bracket" style="display:block;background:#FBBF24;color:#0A0F2E;text-align:center;font-weight:800;font-size:1rem;padding:0.875rem;border-radius:0.875rem;text-decoration:none;">
        Go to My Bracket →
      </a>
    </div>
  `
  try {
    // Legacy bracket_users path — no auth.users record exists, so no prefs.
    // This is a magic-link-style credential email; transactional + no footer.
    await sendEmail({
      to: email,
      accountId: null,
      type: 'bracket_magic_link',
      subject: '🏆 Your WC2026 Bracket is set - here are your login details',
      html,
      transactional: true,
      skipFooter: true,
    })
  } catch {
    // Non-blocking — don't fail account creation if email fails
  }
}


export async function POST(request: Request) {
  try {
    const { email, display_name, first_name, pin, invite_code, action } = await request.json() as {
      email?: string
      display_name: string
      first_name?: string
      pin: string
      invite_code?: string
      action?: 'create' | 'signin'
    }

    // Sign-in mode: display_name + pin only (no email)
    // Create mode: email + display_name + pin
    const isSignIn = action === 'signin' || (!action && !email && !!display_name && !!pin)
    const isCreate = action === 'create' || (!action && !!email && !!display_name && !!pin)
    
    if (!isSignIn && !isCreate) {
      return NextResponse.json({ error: 'Team name and PIN required' }, { status: 400 })
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
    
    // Sign-in mode: find user by first_name
    if (isSignIn) {
      const signinName = (first_name ?? display_name ?? '').trim()
      const { data: existingByName } = await (supabase
        .from('bracket_users')
        .select('id, display_name, pin_hash')
        .ilike('first_name', signinName)
        .limit(1)
        .maybeSingle() as any)
      
      if (!existingByName) {
        return NextResponse.json({ error: 'First name not found. Check spelling or create an account.' }, { status: 404 })
      }
      if (existingByName.pin_hash !== pinHash) {
        return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
      }
      
      // Handle invite code
      if (invite_code) {
        const { data: league } = await (supabase.from('wc26_leagues').select('id').eq('invite_code', invite_code.toUpperCase()).maybeSingle() as any)
        if (league) {
          await (supabase.from('wc26_league_members').upsert({ league_id: league.id, user_id: existingByName.id }, { onConflict: 'league_id,user_id' }) as any)
        }
      }
      
      await upgradeLegacyClient(supabase, existingByName.id)
      return NextResponse.json({
        ok: true,
        userId: existingByName.id,
        displayName: existingByName.display_name,
        deprecated: true,
        message:
          'This sign-in path is deprecated. Use /api/auth/signin (email + password) for cookie-based access.',
      })
    }

    const normalizedEmail = (email ?? '').trim().toLowerCase()

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
          first_name: (first_name ?? display_name).trim(),
          pin_hash: pinHash,
        })
        .select('id, display_name')
        .single()

      if (insertError || !created) {
        return NextResponse.json({ error: insertError?.message ?? 'Failed to create user' }, { status: 500 })
      }
      userId = created.id
      resolvedName = created.display_name
      // Send welcome email with login credentials
      await sendWelcomeEmail(normalizedEmail, resolvedName, pin)
    }

    // Handle invite code
    if (invite_code) {
      const { data: league } = await supabase
        .from('wc26_leagues')
        .select('id')
        .eq('invite_code', invite_code.toUpperCase())
        .single()

      if (league) {
        await supabase
          .from('wc26_league_members')
          .upsert({ league_id: league.id, user_id: userId }, { onConflict: 'league_id,user_id' })
      }
    }

    await upgradeLegacyClient(supabase, userId)
    return NextResponse.json({
      ok: true,
      userId,
      displayName: resolvedName,
      deprecated: true,
      message:
        'This sign-in path is deprecated. Use /api/auth/signin (email + password) for cookie-based access.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
