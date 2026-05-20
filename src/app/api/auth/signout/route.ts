/**
 * POST /api/auth/signout — clear both signed cookies (and legacy unsigned ones).
 */

import { NextResponse } from 'next/server'
import { clearSessions } from '@/lib/auth-cookies'

export async function POST() {
  try {
    await clearSessions()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
