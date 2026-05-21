/**
 * DEPRECATED — quick-signin was a Tier-2 helper. Gone with Supabase Auth
 * unification (2026-05-20). Callers should use /api/auth/signin.
 */

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Quick sign-in is no longer supported. Sign in with email and password at /api/auth/signin.',
      code: 'AUTH_QUICK_GONE',
      use: '/api/auth/signin',
    },
    { status: 410 }
  )
}
