/**
 * POST /api/auth/create-account — Create a new account + owner profile.
 *
 * Body: { email, first_name, pin, display_name?, manager_name }
 *  - email must be unique across accounts
 *  - manager_name is required (Leaderboard "Manager" column)
 *  - display_name optional (falls back to manager_name in UI)
 *  - password_hash starts as 'PENDING_SET'; parent sets a real password later
 *    via Account Settings (Tier 1 PIN flow is the primary login)
 *
 * Sends a Resend welcome email (best-effort, non-blocking).
 * Sets both signed cookies.
 * Returns: { profile, account: { id, email } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { setAccountSession, setProfileSession } from '@/lib/auth-cookies'
import { hashPin, isValidPin } from '@/lib/auth-crypto'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

async function sendWelcomeEmail(
  email: string,
  firstName: string,
  managerName: string,
  pin: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: 'Total90 <noreply@total90.com>',
      to: email,
      subject: '🏆 Your WC2026 account — login details inside',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0A0F2E;color:#F0F4FF;padding:2rem;border-radius:1rem;">
          <img src="https://wc26.total90.com/total90-logo-green.png" alt="Total90" style="width:48px;height:48px;display:block;margin:0 auto 1rem;" />
          <h1 style="color:#FBBF24;text-align:center;font-size:1.4rem;margin:0 0 0.5rem;">Welcome to the Bracket Challenge!</h1>
          <p style="text-align:center;color:#8899CC;margin:0 0 2rem;">World Cup 2026 · Make your picks</p>

          <div style="background:#0F1C4D;border:1px solid #1E3A6E;border-radius:0.875rem;padding:1.5rem;margin-bottom:1.5rem;">
            <p style="margin:0 0 0.5rem;color:#8899CC;font-size:0.85rem;">YOUR LOGIN DETAILS</p>
            <p style="margin:0 0 0.5rem;"><strong style="color:#F0F4FF;">Email:</strong> <span style="color:#FBBF24;">${email}</span></p>
            <p style="margin:0 0 0.5rem;"><strong style="color:#F0F4FF;">First Name:</strong> <span style="color:#FBBF24;">${firstName}</span></p>
            <p style="margin:0 0 0.5rem;"><strong style="color:#F0F4FF;">Manager:</strong> <span style="color:#FBBF24;">${managerName}</span></p>
            <p style="margin:0;"><strong style="color:#F0F4FF;">PIN:</strong> <span style="color:#FBBF24;font-weight:700;letter-spacing:0.2em;">${pin}</span></p>
          </div>

          <p style="text-align:center;color:#8899CC;font-size:0.85rem;margin:0 0 1rem;">Save this email — it&apos;s the only place your PIN is stored.</p>

          <a href="https://wc26.total90.com/bracket" style="display:block;background:#FBBF24;color:#0A0F2E;text-align:center;font-weight:800;font-size:1rem;padding:0.875rem;border-radius:0.875rem;text-decoration:none;">
            Go to My Bracket →
          </a>

          <p style="text-align:center;color:#4A6080;font-size:0.75rem;margin-top:1.5rem;">Total90 · wc26.total90.com</p>
        </div>
      `,
    })
  } catch {
    // Non-blocking
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, first_name, pin, display_name, manager_name } = (await req.json()) as {
      email?: string
      first_name?: string
      pin?: string
      display_name?: string
      manager_name?: string
    }

    if (!email || !first_name || !pin || !manager_name) {
      return NextResponse.json(
        { error: 'Missing required fields: email, first_name, pin, manager_name' },
        { status: 400 }
      )
    }
    if (!isValidPin(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const supabase = sb()

    // Reject duplicate account
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error:
            'An account already exists for this email. Sign in with your first name + PIN instead.',
          code: 'ACCOUNT_EXISTS',
        },
        { status: 409 }
      )
    }

    const { data: account, error: accountErr } = await supabase
      .from('accounts')
      .insert({ email: normalizedEmail, password_hash: 'PENDING_SET' })
      .select('id, email')
      .single()

    if (accountErr || !account) {
      return NextResponse.json(
        { error: accountErr?.message ?? 'Failed to create account' },
        { status: 500 }
      )
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .insert({
        account_id: account.id,
        first_name: first_name.trim(),
        pin_hash: hashPin(pin),
        manager_name: manager_name.trim(),
        display_name: display_name?.trim() || null,
        is_owner: true,
      })
      .select('id, first_name, manager_name, display_name, is_owner')
      .single()

    if (profileErr || !profile) {
      // Best-effort cleanup of the orphan account so a retry can use the same email.
      await supabase.from('accounts').delete().eq('id', account.id)
      return NextResponse.json(
        { error: profileErr?.message ?? 'Failed to create profile' },
        { status: 500 }
      )
    }

    await setAccountSession(account.id)
    await setProfileSession(profile.id)

    // Fire-and-forget welcome email
    sendWelcomeEmail(normalizedEmail, first_name.trim(), manager_name.trim(), pin).catch(() => {})

    return NextResponse.json(
      {
        account: { id: account.id, email: account.email },
        profile,
      },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
