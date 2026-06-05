/**
 * PATCH  /api/auth/profiles/[id] — edit a profile (first_name, last_name,
 *                                  manager_name).
 * DELETE /api/auth/profiles/[id] — owner deletes a sub-profile.
 *
 * Authorization (both methods):
 *   - Caller must have a Supabase Auth session.
 *   - Caller must be the OWNER of the account that the target profile
 *     belongs to (i.e. there exists a profile with caller.user.id ==
 *     account_id, is_owner=true, and target.account_id == caller.user.id).
 *   - This means: kids can NOT edit or delete profiles (no change from
 *     today — they couldn't before this endpoint existed).
 *
 * PATCH-specific rules:
 *   - After the Round 1 (group_r1) lock, first_name + last_name are
 *     immutable. Attempts return 409 `{ error: 'Name locked …' }`.
 *     manager_name remains editable forever.
 *   - first_name uniqueness within the account is still enforced.
 *
 * DELETE-specific rules:
 *   - Owner can NOT delete their own profile (would orphan the account) —
 *     returns 400 with explicit message.
 *   - After R1 lock, deletes are HARD-blocked (409) to preserve leaderboard
 *     history.
 *   - Before R1 lock, deletes cascade across every profile_id reference
 *     in a single best-effort sequence using the service-role client.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server'
import { isProfileNameLocked } from '@/lib/predictor/round-lock'

// Tables that reference profiles.id via a profile_id column. Order matters:
// child rows must go before the parent profile row. Verified against the
// public schema 2026-06-04 (see SQL: column_name='profile_id').
const PROFILE_CHILD_TABLES = [
  'predictor_picks',
  'predictor_scores',
  'predictor_winner_picks',
  'predictor_leaderboard_cache',
  'wc26_predictor_league_members',
  'wc26_league_members',
  'bracket_entries',
] as const

interface SessionContext {
  userId: string
  ownerProfile: {
    id: string
    account_id: string
    is_owner: boolean
  }
}

/**
 * Resolves the caller and verifies they own an account. Returns either the
 * resolved context or a NextResponse to short-circuit with.
 */
async function requireOwnerSession(): Promise<
  | { ok: true; ctx: SessionContext }
  | { ok: false; res: NextResponse }
> {
  const supa = await createServerSupabase()
  const { data: userData } = await supa.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    }
  }

  const admin = createAdminSupabase()
  const { data: ownerRow } = await admin
    .from('profiles')
    .select('id, account_id, is_owner')
    .eq('account_id', userId)
    .eq('is_owner', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (!ownerRow) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Only the account owner can manage profiles.' },
        { status: 403 }
      ),
    }
  }

  return { ok: true, ctx: { userId, ownerProfile: ownerRow } }
}

// ---------------------------------------------------------------------------
// PATCH /api/auth/profiles/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params

    const sessionResult = await requireOwnerSession()
    if (!sessionResult.ok) return sessionResult.res
    const { ctx } = sessionResult

    const body = (await req.json()) as {
      first_name?: string | null
      last_name?: string | null
      manager_name?: string | null
    }

    const admin = createAdminSupabase()

    // Fetch the target profile and confirm it belongs to this account.
    const { data: target } = await admin
      .from('profiles')
      .select('id, account_id, first_name, last_name, manager_name, is_owner')
      .eq('id', targetId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!target) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
    }
    if (target.account_id !== ctx.userId) {
      return NextResponse.json(
        { error: 'Profile does not belong to your account.' },
        { status: 403 }
      )
    }

    const updates: Record<string, string> = {}
    const wantsFirstNameChange =
      typeof body.first_name === 'string' &&
      body.first_name.trim() !== '' &&
      body.first_name.trim() !== (target.first_name ?? '').trim()
    const wantsLastNameChange =
      typeof body.last_name === 'string' &&
      body.last_name.trim() !== (target.last_name ?? '').trim()
    const wantsManagerChange =
      typeof body.manager_name === 'string' &&
      body.manager_name.trim() !== '' &&
      body.manager_name.trim() !== (target.manager_name ?? '').trim()

    // Name-lock gate: after R1, only manager_name is editable.
    if (wantsFirstNameChange || wantsLastNameChange) {
      const locked = await isProfileNameLocked()
      if (locked) {
        return NextResponse.json(
          { error: 'Name locked — Round 1 has started.' },
          { status: 409 }
        )
      }
    }

    if (wantsFirstNameChange) {
      const newFirst = body.first_name!.trim()
      // Re-check uniqueness within the account (case-insensitive), excluding
      // the target row itself.
      const { data: clash } = await admin
        .from('profiles')
        .select('id')
        .eq('account_id', ctx.userId)
        .ilike('first_name', newFirst)
        .neq('id', targetId)
        .is('deleted_at', null)
        .maybeSingle()
      if (clash) {
        return NextResponse.json(
          { error: 'A profile with that first name already exists on this account.' },
          { status: 409 }
        )
      }
      updates.first_name = newFirst
    }
    if (wantsLastNameChange) {
      // last_name can be set to '' explicitly? We treat empty string as null.
      updates.last_name = body.last_name!.trim() || (null as unknown as string)
    }
    if (wantsManagerChange) {
      updates.manager_name = body.manager_name!.trim()
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        profile: {
          id: target.id,
          first_name: target.first_name,
          last_name: target.last_name,
          manager_name: target.manager_name,
          is_owner: target.is_owner,
        },
        unchanged: true,
      })
    }

    const { data: updated, error: updateErr } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', targetId)
      .select('id, first_name, last_name, manager_name, display_name, is_owner')
      .single()

    if (updateErr) {
      console.error('Error updating profile:', updateErr)
      return NextResponse.json(
        { error: 'Failed to update profile.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ profile: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/auth/profiles/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params

    const sessionResult = await requireOwnerSession()
    if (!sessionResult.ok) return sessionResult.res
    const { ctx } = sessionResult

    const admin = createAdminSupabase()

    const { data: target } = await admin
      .from('profiles')
      .select('id, account_id, first_name, is_owner')
      .eq('id', targetId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!target) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
    }
    if (target.account_id !== ctx.userId) {
      return NextResponse.json(
        { error: 'Profile does not belong to your account.' },
        { status: 403 }
      )
    }
    if (target.is_owner) {
      return NextResponse.json(
        { error: 'You cannot delete the owner profile — that would orphan the account.' },
        { status: 400 }
      )
    }

    // Time gate: hard-block after R1 kicks off.
    if (await isProfileNameLocked()) {
      return NextResponse.json(
        {
          error:
            'Cannot delete after Round 1 has started — leaderboard history is locked.',
        },
        { status: 409 }
      )
    }

    // Cascade. We don't have multi-statement transactions through the
    // Supabase JS client, so we run the deletes sequentially. Each child
    // table is independent; failure mid-cascade leaves orphan rows that
    // are harmless (FKs are unenforced for some of these), but we surface
    // any error to the caller so they can retry.
    for (const table of PROFILE_CHILD_TABLES) {
      const { error: childErr } = await admin
        .from(table)
        .delete()
        .eq('profile_id', targetId)
      if (childErr) {
        console.error(`Cascade delete failed on ${table}:`, childErr)
        return NextResponse.json(
          {
            error: `Failed to delete dependent rows in ${table}.`,
            detail: childErr.message,
          },
          { status: 500 }
        )
      }
    }

    // Finally, the profile itself. Hard delete (not soft) — Hugh's call:
    // pre-R1 means no leaderboard history exists yet, so there's nothing
    // worth preserving via soft-delete.
    const { error: profileErr } = await admin
      .from('profiles')
      .delete()
      .eq('id', targetId)

    if (profileErr) {
      console.error('Final profile delete failed:', profileErr)
      return NextResponse.json(
        { error: 'Failed to delete profile.', detail: profileErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, deleted_id: targetId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
