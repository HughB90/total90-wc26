import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Bracket picks save/load.
 *
 * Pass 2+5 auth migration left this route behind: the client now sends the
 * `profile.id` from /api/auth/me, while existing bracket_entries.user_id rows
 * still carry the legacy `bracket_users.id`. We accept either id and resolve
 * to the canonical row(s) before reading/writing.
 *
 * Resolution rule:
 *   - If a row exists in bracket_entries where profile_id = caller-id, use
 *     that row's user_id as the canonical key (a migrated user).
 *   - Else, if a bracket_users row exists with id = caller-id, treat the
 *     caller as a legacy/un-migrated user (use that id directly).
 *   - Else 401 SESSION_EXPIRED.
 *
 * On write we always stamp both columns (user_id + profile_id) so future
 * lookups are O(1) on either side.
 */

interface ResolvedCaller {
  userId: string       // canonical legacy bracket_users.id (or profile.id if no shim)
  profileId: string    // always the new profile.id when known
}

async function resolveCaller(
  supabase: SupabaseClient,
  callerId: string,
): Promise<ResolvedCaller | null> {
  // 1. Existing entry keyed on this profile_id → use its user_id as canonical.
  const { data: byProfile } = await supabase
    .from('bracket_entries')
    .select('user_id, profile_id')
    .eq('profile_id', callerId)
    .limit(1)

  if (byProfile && byProfile.length > 0) {
    return { userId: byProfile[0].user_id, profileId: callerId }
  }

  // 2. Legacy bracket_users row directly matches (un-migrated user).
  const { data: legacyUser } = await (
    supabase.from('bracket_users').select('id').eq('id', callerId).maybeSingle() as any
  )
  if (legacyUser) {
    return { userId: callerId, profileId: callerId }
  }

  // 3. Maybe the caller is a brand-new migrated profile with no entries yet.
  //    Confirm against profiles table; if real, treat profile.id as user_id.
  const { data: profile } = await (
    supabase.from('profiles').select('id').eq('id', callerId).maybeSingle() as any
  )
  if (profile) {
    return { userId: callerId, profileId: callerId }
  }

  return null
}

export async function POST(request: Request) {
  try {
    const { userId, phase, picks } = await request.json() as {
      userId: string
      phase: string
      picks: unknown
    }

    if (!userId || !phase || picks === undefined) {
      return NextResponse.json({ error: 'userId, phase, and picks required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const resolved = await resolveCaller(supabase, userId)
    if (!resolved) {
      return NextResponse.json({ error: 'SESSION_EXPIRED', message: 'Your session has expired. Please log out and sign in again.' }, { status: 401 })
    }

    // Check if entry exists for this user + phase (match by either id).
    const { data: existing } = await supabase
      .from('bracket_entries')
      .select('id')
      .or(`user_id.eq.${resolved.userId},profile_id.eq.${resolved.profileId}`)
      .eq('phase', phase)
      .limit(1)

    const existingRow = existing && existing.length > 0 ? existing[0] : null

    if (existingRow) {
      const { error } = await supabase
        .from('bracket_entries')
        .update({ picks, user_id: resolved.userId, profile_id: resolved.profileId })
        .eq('id', existingRow.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('bracket_entries')
        .insert({ user_id: resolved.userId, profile_id: resolved.profileId, phase, picks, score: 0 })

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Match by either column so post-migration profile.id callers still see
    // their legacy bracket_users.id-keyed picks.
    const { data, error } = await supabase
      .from('bracket_entries')
      .select('phase, picks, score')
      .or(`user_id.eq.${userId},profile_id.eq.${userId}`)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, entries: data ?? [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
