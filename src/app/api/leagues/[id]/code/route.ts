/**
 * PATCH /api/leagues/:id/code
 *
 * Commissioner-only invite code change. Enforces:
 *   - caller must be league creator
 *   - max 3 code changes per league (code_changes_used counter)
 *   - new code: 6-char uppercase alphanumeric, platform-unique
 *   - on change: append old code to wc26_league_code_history with 7-day expires_at
 *
 * Body: { new_code?: string }   // if omitted, generate one automatically
 *
 * Returns: { league: { id, invite_code, code_changes_used } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase-server'
import { resolveSession } from '@/lib/auth-session-server'

export const dynamic = 'force-dynamic'

const CODE_CHANGE_CAP = 3
const CODE_REDIRECT_TTL_DAYS = 7

function randomCode(): string {
  // Excludes confusable chars (0/O, 1/I)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code)
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'league_id_required' }, { status: 400 })

  const { account } = await resolveSession()
  if (!account) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { new_code?: unknown } = {}
  try { body = await req.json() } catch { /* allow empty */ }

  let newCode: string | null = null
  if (typeof body.new_code === 'string' && body.new_code.length > 0) {
    newCode = body.new_code.trim().toUpperCase()
    if (!isValidCode(newCode)) return NextResponse.json({ error: 'invalid_code_format' }, { status: 400 })
  }

  const sb = createAdminSupabase()

  // Load league + verify creator + cap
  const { data: league } = await sb
    .from('wc26_leagues')
    .select('id, invite_code, creator_id, code_changes_used')
    .eq('id', id)
    .maybeSingle()
  if (!league) return NextResponse.json({ error: 'league_not_found' }, { status: 404 })
  if (league.creator_id !== account.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const usedSoFar = league.code_changes_used ?? 0
  if (usedSoFar >= CODE_CHANGE_CAP) {
    return NextResponse.json({
      error: 'code_change_cap_reached',
      used: usedSoFar, cap: CODE_CHANGE_CAP,
    }, { status: 409 })
  }

  // Pick a unique code (generate or validate the requested one)
  if (newCode) {
    const { data: dupe } = await sb
      .from('wc26_leagues')
      .select('id')
      .eq('invite_code', newCode)
      .maybeSingle()
    if (dupe && dupe.id !== id) {
      return NextResponse.json({ error: 'code_taken' }, { status: 409 })
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const candidate = randomCode()
      const { data: dupe } = await sb
        .from('wc26_leagues')
        .select('id')
        .eq('invite_code', candidate)
        .maybeSingle()
      if (!dupe) { newCode = candidate; break }
    }
    if (!newCode) return NextResponse.json({ error: 'could_not_generate_unique_code' }, { status: 500 })
  }

  // Stash old code in history (7-day redirect window)
  const expiresAt = new Date(Date.now() + CODE_REDIRECT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await sb.from('wc26_league_code_history').insert({
    league_id: league.id,
    old_code: league.invite_code,
    expires_at: expiresAt,
  })

  // Apply change + increment counter
  const { data: updated, error } = await sb
    .from('wc26_leagues')
    .update({ invite_code: newCode, code_changes_used: usedSoFar + 1 })
    .eq('id', id)
    .select('id, invite_code, code_changes_used')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    league: updated,
    old_code: league.invite_code,
    code_changes_remaining: CODE_CHANGE_CAP - (updated?.code_changes_used ?? CODE_CHANGE_CAP),
  })
}
