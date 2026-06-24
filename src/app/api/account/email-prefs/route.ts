/**
 * /api/account/email-prefs
 *   GET  → current email_prefs for the signed-in account (Supabase SSR cookie)
 *   POST → update toggleable flags. Body: any subset of
 *          { round_reminders, league_invites, winner_lock, marketing, unsub_all }
 *          Only booleans accepted.
 *
 * Auth: Supabase SSR cookie (sb-*). 401 if not signed in.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server'
import { ensurePrefs } from '@/lib/email/prefs'

const TOGGLE_COLUMNS = [
  'round_reminders',
  'league_invites',
  'winner_lock',
  'marketing',
  'unsub_all',
] as const

type ToggleColumn = (typeof TOGGLE_COLUMNS)[number]

export async function GET() {
  const supa = await createServerSupabase()
  const { data: userData } = await supa.auth.getUser()
  const user = userData?.user
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const prefs = await ensurePrefs(user.id)
  if (!prefs) {
    return NextResponse.json({ error: 'Could not load preferences.' }, { status: 500 })
  }

  // Don't expose the unsub_token to the authed-self GET (defense in depth).
  // The token is for link-based unsub only; in-app changes go via this endpoint
  // and don't need it.
  const { unsub_token: _omit, ...safe } = prefs as Record<string, unknown>
  void _omit
  return NextResponse.json({ prefs: safe })
}

export async function POST(req: NextRequest) {
  const supa = await createServerSupabase()
  const { data: userData } = await supa.auth.getUser()
  const user = userData?.user
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const update: Partial<Record<ToggleColumn, boolean>> = {}
  for (const col of TOGGLE_COLUMNS) {
    if (col in body) {
      if (typeof body[col] !== 'boolean') {
        return NextResponse.json(
          { error: `Field "${col}" must be boolean.` },
          { status: 400 }
        )
      }
      update[col] = body[col] as boolean
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  // Make sure a row exists, then update via admin (bypasses RLS — we already
  // verified ownership via the SSR session above).
  await ensurePrefs(user.id)
  const admin = createAdminSupabase()
  const { data: updated, error } = await admin
    .from('email_prefs')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('account_id', user.id)
    .select('*')
    .maybeSingle()

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update preferences.' },
      { status: 500 }
    )
  }

  const { unsub_token: _omit, ...safe } = updated as Record<string, unknown>
  void _omit
  return NextResponse.json({ prefs: safe })
}
