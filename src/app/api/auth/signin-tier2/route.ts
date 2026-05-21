/**
 * DEPRECATED — Tier 2 (display-name + PIN) signin is gone in the Supabase Auth
 * unification (2026-05-20). See /api/auth/signin-tier1/route.ts.
 */

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Tier 2 sign-in is no longer supported. Sign in with your email and password instead.',
      code: 'AUTH_TIER2_GONE',
      use: '/api/auth/signin',
    },
    { status: 410 }
  )
}
