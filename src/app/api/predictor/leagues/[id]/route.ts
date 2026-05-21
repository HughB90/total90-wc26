/**
 * GET    /api/predictor/leagues/[id]    — league info + members + my-picks summary
 * PATCH  /api/predictor/leagues/[id]    — { name? | regen_invite?: true }   (admin only)
 * DELETE /api/predictor/leagues/[id]    — delete league                     (admin only)
 *
 * Membership semantics:
 *   - Any authed profile can GET (so league previews work).
 *   - Mutations require the caller to be a league admin (`is_admin = true`).
 *
 * Returns shape on GET:
 *   {
 *     league: { id, name, invite_code, created_by, created_at },
 *     members: [{ profile_id, manager_name, first_name, is_admin, joined_at }],
 *     is_admin: boolean,
 *     is_member: boolean
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProfileSession } from '@/lib/predictor-session'
import { predictorAdmin } from '@/lib/predictor-db'
import { randomInviteCode } from '@/lib/predictor-leagues'

export const dynamic = 'force-dynamic'

const MAX_NAME_LEN = 80

async function loadLeague(id: string) {
  const sb = predictorAdmin()
  const { data, error } = await sb
    .from('wc26_predictor_leagues')
    .select('id, name, invite_code, created_by, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const sb = predictorAdmin()
  const session = await getProfileSession()

  const league = await loadLeague(id).catch((e) => {
    throw e
  })
  if (!league) return NextResponse.json({ error: 'league_not_found' }, { status: 404 })

  const { data: members, error: mErr } = await sb
    .from('wc26_predictor_league_members')
    .select('profile_id, is_admin, joined_at')
    .eq('league_id', id)
    .order('joined_at', { ascending: true })

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const profileIds = (members ?? []).map((m) => m.profile_id)
  const { data: profiles } = profileIds.length
    ? await sb.from('profiles').select('id, manager_name, first_name').in('id', profileIds)
    : { data: [] as { id: string; manager_name: string | null; first_name: string | null }[] }

  const profileMap = new Map<string, { manager_name: string | null; first_name: string | null }>()
  for (const p of profiles ?? []) {
    profileMap.set(p.id, { manager_name: p.manager_name, first_name: p.first_name })
  }

  const enrichedMembers = (members ?? []).map((m) => {
    const p = profileMap.get(m.profile_id)
    return {
      profile_id: m.profile_id,
      manager_name: p?.manager_name ?? p?.first_name ?? 'Manager',
      first_name: p?.first_name ?? '',
      is_admin: m.is_admin,
      joined_at: m.joined_at,
    }
  })

  const callerMember = session
    ? (members ?? []).find((m) => m.profile_id === session.profile_id)
    : undefined

  return NextResponse.json({
    league,
    members: enrichedMembers,
    is_admin: Boolean(callerMember?.is_admin),
    is_member: Boolean(callerMember),
  })
}

async function assertAdmin(leagueId: string, profileId: string) {
  const sb = predictorAdmin()
  const { data } = await sb
    .from('wc26_predictor_league_members')
    .select('is_admin')
    .eq('league_id', leagueId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return Boolean(data?.is_admin)
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const isAdmin = await assertAdmin(id, session.profile_id)
  if (!isAdmin) return NextResponse.json({ error: 'not_admin' }, { status: 403 })

  let body: { name?: unknown; regen_invite?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const sb = predictorAdmin()
  const patch: Record<string, string> = {}

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim()
    if (!trimmed) return NextResponse.json({ error: 'name_required' }, { status: 400 })
    if (trimmed.length > MAX_NAME_LEN) {
      return NextResponse.json({ error: 'name_too_long' }, { status: 400 })
    }
    patch.name = trimmed
  }

  if (body.regen_invite === true) {
    let code = randomInviteCode()
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await sb
        .from('wc26_predictor_leagues')
        .select('id')
        .eq('invite_code', code)
        .maybeSingle()
      if (!existing) break
      code = randomInviteCode()
    }
    patch.invite_code = code
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 })
  }

  const { data, error } = await sb
    .from('wc26_predictor_leagues')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, invite_code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ league: data })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const session = await getProfileSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const isAdmin = await assertAdmin(id, session.profile_id)
  if (!isAdmin) return NextResponse.json({ error: 'not_admin' }, { status: 403 })

  const sb = predictorAdmin()
  // Cascade kicks members thanks to FK ON DELETE CASCADE
  const { error } = await sb.from('wc26_predictor_leagues').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
