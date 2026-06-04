/**
 * POST /api/auth/reset-password — kick off a Supabase Auth recovery email.
 *
 * Body: { email }
 * Always returns 200 (do not leak whether the email exists).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'

const SITE_BASE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://wc26.total90.com'

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email?: string }
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const admin = createAdminSupabase()
    // resetPasswordForEmail dispatches the Supabase-templated recovery mail.
    await admin.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
      // Route through /auth/callback so the PKCE `?code=` is exchanged for a
      // real session server-side before the user lands on the form. The
      // callback forwards to /auth/reset-password on `type=recovery`.
      redirectTo: `${SITE_BASE}/auth/callback?type=recovery`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Always succeed loudly — never leak whether the email exists.
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.warn('resetPasswordForEmail failed (returning 200 anyway):', message)
    return NextResponse.json({ ok: true })
  }
}
