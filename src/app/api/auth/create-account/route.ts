/**
 * POST /api/auth/create-account — Supabase signUp + create owner profile.
 *
 * Body: { email, password, first_name, manager_name, display_name?, pin? }
 *   - email/password: Supabase Auth credentials
 *   - first_name + manager_name: required for the initial owner profile
 *   - display_name: optional friendly name (falls back to manager_name in UI)
 *   - pin: optional 4-digit PIN for the profile picker quick-switch.
 *     If omitted, defaults to '0000' (parent can change in account settings).
 *
 * On success:
 *   - Supabase SSR cookies (`sb-*`) are written by @supabase/ssr.
 *   - Owner profile row is created in `profiles`, FK = auth.users.id.
 *   - `t90_profile_id` cookie is set to the new owner profile.
 * Returns: { account: { id, email }, profile }
 *
 * Sends a Resend welcome email (best-effort, non-blocking).
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server'
import { setProfileCookie } from '@/lib/auth-cookies'
import { hashPin, isValidPin } from '@/lib/auth-crypto'

async function sendWelcomeEmail(
  email: string,
  firstName: string,
  managerName: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: 'Total90 <noreply@total90.com>',
      to: email,
      subject: '🏆 Your WC2026 account is ready',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0A0F2E;color:#F0F4FF;padding:2rem;border-radius:1rem;">
          <img src="https://wc26.total90.com/total90-logo-green.png" alt="Total90" style="width:48px;height:48px;display:block;margin:0 auto 1rem;" />
          <h1 style="color:#FBBF24;text-align:center;font-size:1.4rem;margin:0 0 0.5rem;">Welcome to the Bracket Challenge!</h1>
          <p style="text-align:center;color:#8899CC;margin:0 0 2rem;">World Cup 2026 · Make your picks</p>

          <div style="background:#0F1C4D;border:1px solid #1E3A6E;border-radius:0.875rem;padding:1.5rem;margin-bottom:1.5rem;">
            <p style="margin:0 0 0.5rem;color:#8899CC;font-size:0.85rem;">ACCOUNT DETAILS</p>
            <p style="margin:0 0 0.5rem;"><strong style="color:#F0F4FF;">Email:</strong> <span style="color:#FBBF24;">${email}</span></p>
            <p style="margin:0 0 0.5rem;"><strong style="color:#F0F4FF;">First Name:</strong> <span style="color:#FBBF24;">${firstName}</span></p>
            <p style="margin:0;"><strong style="color:#F0F4FF;">Manager:</strong> <span style="color:#FBBF24;">${managerName}</span></p>
          </div>

          <p style="text-align:center;color:#8899CC;font-size:0.85rem;margin:0 0 1rem;">Sign in any time with your email and password.</p>

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
    const { email, password, first_name, manager_name, display_name, pin } =
      (await req.json()) as {
        email?: string
        password?: string
        first_name?: string
        manager_name?: string
        display_name?: string
        pin?: string
      }

    if (!email || !password || !first_name || !manager_name) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, first_name, manager_name' },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }
    const finalPin = pin ?? '0000'
    if (!isValidPin(finalPin)) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 digits.' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // 1. Supabase signUp — this writes the sb-* cookies on success.
    const supa = await createServerSupabase()
    const { data: signUpData, error: signUpErr } = await supa.auth.signUp({
      email: normalizedEmail,
      password,
    })

    if (signUpErr || !signUpData?.user) {
      const msg = signUpErr?.message ?? 'Failed to create account.'
      const code =
        msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')
          ? 'ACCOUNT_EXISTS'
          : undefined
      return NextResponse.json(
        { error: msg, code },
        { status: code === 'ACCOUNT_EXISTS' ? 409 : 400 }
      )
    }

    const userId = signUpData.user.id

    // 2. Auto-confirm the email so the user can sign in immediately (no click).
    //    Tournament audience is tiny + trusted; skip the verify-your-email step.
    const admin = createAdminSupabase()
    try {
      await admin.auth.admin.updateUserById(userId, { email_confirm: true })
    } catch (e) {
      console.warn('email_confirm update failed (non-fatal):', e)
    }

    // 3. Create the owner profile (FK profiles.account_id -> auth.users.id).
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .insert({
        account_id: userId,
        first_name: first_name.trim(),
        pin_hash: hashPin(finalPin),
        manager_name: manager_name.trim(),
        display_name: display_name?.trim() || null,
        is_owner: true,
      })
      .select('id, first_name, manager_name, display_name, is_owner')
      .single()

    if (profileErr || !profile) {
      // Best-effort cleanup of the auth.users row so the email isn't stuck taken.
      try {
        await admin.auth.admin.deleteUser(userId)
      } catch {}
      return NextResponse.json(
        { error: profileErr?.message ?? 'Failed to create profile.' },
        { status: 500 }
      )
    }

    // 4. Set the profile-hint cookie.
    await setProfileCookie(profile.id)

    // 5. Fire-and-forget welcome email.
    sendWelcomeEmail(normalizedEmail, first_name.trim(), manager_name.trim()).catch(() => {})

    return NextResponse.json(
      {
        account: { id: userId, email: normalizedEmail },
        profile,
      },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
