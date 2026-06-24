/**
 * POST /api/account/email-prefs/resub
 *
 * Body: { token: string, type?: string, all?: boolean }
 *   - token: the unsub_token from the email link
 *   - all=true → unset unsub_all (re-enable everything)
 *   - else → re-enable the per-type flag (or marketing if type is unknown)
 *
 * No auth required — token IS the auth (matches the unsubscribe page model).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'
import { prefColumnForType } from '@/lib/email/prefs'

export async function POST(req: NextRequest) {
  let body: { token?: string; type?: string; all?: boolean } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const token = body.token?.trim()
  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data: prefs } = await admin
    .from('email_prefs')
    .select('unsub_token')
    .eq('unsub_token', token)
    .maybeSingle()

  if (!prefs) {
    return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 404 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.all) {
    update.unsub_all = false
  } else {
    const col = body.type ? prefColumnForType(body.type) : null
    if (col) {
      update[col] = true
    } else {
      // Unknown type — default to marketing (matches unsub fallback).
      update.marketing = true
    }
  }

  const { error } = await admin
    .from('email_prefs')
    .update(update)
    .eq('unsub_token', token)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
