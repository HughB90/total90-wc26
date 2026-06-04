/**
 * /auth/callback — handles Supabase Auth email link redirects.
 *
 * Supabase Auth (with PKCE / the newer email-link format) appends a
 * `?code=<one-time-code>` (and often `?type=recovery|signup|magiclink`) to
 * the configured `redirectTo`. We exchange that code for a real session
 * via the SSR client (which writes the `sb-*` cookies for us), then
 * forward the user to the right destination:
 *
 *   - type=recovery → /auth/reset-password
 *   - everything else → ?next=<path> if present, else /bracket
 *
 * Errors fall back to /auth/signin?reset=expired so the UI can explain.
 *
 * NOTE: this also tolerates the legacy hash-fragment flow
 * (`#access_token=...&type=recovery`) by simply forwarding to the
 * destination page; the browser-side Supabase client there handles the
 * fragment on its own.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const type = url.searchParams.get('type') // 'recovery' | 'signup' | 'magiclink' | ...
  const errParam = url.searchParams.get('error') || url.searchParams.get('error_description')
  const next = url.searchParams.get('next')

  // Build the destination URL up front so we have one place to reason about it.
  const dest = new URL(
    type === 'recovery'
      ? '/auth/reset-password'
      : next && next.startsWith('/')
        ? next
        : '/bracket',
    url.origin
  )

  // Supabase returned an error in the link itself (expired / already used).
  if (errParam) {
    const errUrl = new URL('/auth/signin', url.origin)
    errUrl.searchParams.set('reset', 'expired')
    return NextResponse.redirect(errUrl)
  }

  // PKCE / token_hash flow: exchange the one-time code for a session.
  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.warn('auth/callback exchange failed:', error.message)
      const errUrl = new URL('/auth/signin', url.origin)
      errUrl.searchParams.set('reset', 'expired')
      return NextResponse.redirect(errUrl)
    }
    return NextResponse.redirect(dest)
  }

  // No code present — this is the legacy hash-fragment flow. The fragment
  // never reaches the server, so we just forward to the page and let the
  // client-side Supabase pick it up there.
  return NextResponse.redirect(dest)
}
