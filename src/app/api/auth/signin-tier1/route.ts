/**
 * DEPRECATED — Tier 1 (first-name + PIN) signin is gone in the Supabase Auth
 * unification (2026-05-20). Parents now sign in with email + password via
 * /api/auth/signin and then pick a profile post-login.
 *
 * This route returns 410 Gone with a hint so any cached client falls back.
 */

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Tier 1 sign-in (first name + PIN) is no longer supported. Sign in with your email and password instead.',
      code: 'AUTH_TIER1_GONE',
      use: '/api/auth/signin',
    },
    { status: 410 }
  )
}
