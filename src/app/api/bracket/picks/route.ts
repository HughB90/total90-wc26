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
  // user_id to stamp on bracket_entries. NULL for post Pass 2+5 profile-only
  // users (bracket_entries.user_id no longer FKs to bracket_users and is now
  // nullable — see migration 2026-06-08-bracket-entries-profile-fk.sql).
  userId: string | null
  profileId: string   // always the new profile.id when known
}

async function resolveCaller(
  supabase: SupabaseClient,
  callerId: string,
): Promise<ResolvedCaller | null> {
  // 1. Existing entry keyed on this profile_id → reuse its user_id (may be NULL
  //    for rows written post-migration; that's fine).
  const { data: byProfile } = await supabase
    .from('bracket_entries')
    .select('user_id, profile_id')
    .eq('profile_id', callerId)
    .limit(1)

  if (byProfile && byProfile.length > 0) {
    return { userId: byProfile[0].user_id ?? null, profileId: callerId }
  }

  // 2. Legacy bracket_users row directly matches (un-migrated user).
  const { data: legacyUser } = await (
    supabase.from('bracket_users').select('id').eq('id', callerId).maybeSingle() as any
  )
  if (legacyUser) {
    return { userId: callerId, profileId: callerId }
  }

  // 3. Brand-new post Pass 2+5 profile with no entries yet. Confirm against
  //    profiles; if real, leave user_id NULL (would FK-fail otherwise) and
  //    stamp profile_id only.
  const { data: profile } = await (
    supabase.from('profiles').select('id').eq('id', callerId).maybeSingle() as any
  )
  if (profile) {
    return { userId: null, profileId: callerId }
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

    // Lock group + 3rd-place picks once the group stage is final. The bracket
    // page exposes the locked state to the UI; this server-side check is the
    // authoritative guard against late writes (e.g. stale clients).
    if (phase === 'group' || phase === 'third') {
      const { data: gr } = await (
        supabase.from('bracket_config').select('value').eq('key', 'group_results').maybeSingle() as any
      )
      const grValue = gr?.value
      const groupResultsSet = grValue && typeof grValue === 'object' && Object.keys(grValue).length > 0
      if (groupResultsSet) {
        return NextResponse.json(
          { error: 'phase_locked', message: 'Group stage is final — group and 3rd-place picks are locked.' },
          { status: 403 },
        )
      }
    }

    // Check if entry exists for this user + phase (match by either id).
    const orParts = [`profile_id.eq.${resolved.profileId}`]
    if (resolved.userId) orParts.unshift(`user_id.eq.${resolved.userId}`)
    const { data: existing } = await supabase
      .from('bracket_entries')
      .select('id')
      .or(orParts.join(','))
      .eq('phase', phase)
      .limit(1)

    const existingRow = existing && existing.length > 0 ? existing[0] : null

    // Only stamp user_id when we have a real one (legacy bracket_users.id);
    // post Pass 2+5 profiles set it to NULL to avoid the dropped FK.
    const writeRow: Record<string, unknown> = { picks, profile_id: resolved.profileId }
    if (resolved.userId) writeRow.user_id = resolved.userId

    if (existingRow) {
      const { error } = await supabase
        .from('bracket_entries')
        .update(writeRow)
        .eq('id', existingRow.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('bracket_entries')
        .insert({ ...writeRow, phase, score: 0 })

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
