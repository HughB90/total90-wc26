/**
 * POST /api/auth/signout — Supabase signOut + clear profile/legacy cookies.
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { clearProfileCookie } from '@/lib/auth-cookies'

export async function POST() {
  try {
    const supa = await createServerSupabase()
    await supa.auth.signOut().catch(() => {})
    await clearProfileCookie()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
