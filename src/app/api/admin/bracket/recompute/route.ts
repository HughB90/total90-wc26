// POST /api/admin/bracket/recompute
//
// Recomputes every user's per-phase score from current bracket_config results
// and writes the per-phase subtotal into bracket_entries.score. The leaderboard
// route already SUMs across phases, so this keeps it consistent.
//
// Auth (Pass 1): require header `x-admin-key: <BRACKET_ADMIN_KEY>`.
// BRACKET_ADMIN_KEY is an env var. If unset, the route refuses with 503.
//
// TODO: swap header auth for proper admin auth once Sessions SSO lands.
// TODO: tiebreakers — exact-score picks → Final pts → SF → QF → R16 → Groups.
//       Not in this pass.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeFullScore, type BracketResults } from '@/lib/bracket/scoring'

type BracketEntryRow = {
  id: string
  user_id: string
  phase: string
  picks: unknown
  score: number | null
}

export async function POST(request: Request) {
  try {
    const adminKey = process.env.BRACKET_ADMIN_KEY
    if (!adminKey) {
      return NextResponse.json(
        { ok: false, error: 'BRACKET_ADMIN_KEY env var not configured on this deployment.' },
        { status: 503 },
      )
    }

    const providedKey = request.headers.get('x-admin-key') ?? ''
    if (providedKey !== adminKey) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 1. Load bracket_config for results
    const { data: configRows, error: configErr } = await supabase
      .from('bracket_config')
      .select('key, value')
      .in('key', ['group_results', 'third_results', 'knockout_results'])

    if (configErr) {
      return NextResponse.json({ ok: false, error: configErr.message }, { status: 500 })
    }

    const results: BracketResults = {}
    for (const row of configRows ?? []) {
      const key = (row as { key: string; value: unknown }).key
      const value = (row as { key: string; value: unknown }).value
      if (key === 'group_results' && value && typeof value === 'object') {
        results.group_results = value as BracketResults['group_results']
      } else if (key === 'third_results' && Array.isArray(value)) {
        results.third_results = value as string[]
      } else if (key === 'knockout_results' && value && typeof value === 'object') {
        results.knockout_results = value as BracketResults['knockout_results']
      }
    }

    // 2. Load all entries
    const { data: entries, error: entriesErr } = await supabase
      .from('bracket_entries')
      .select('id, user_id, phase, picks, score')
      .limit(10000)

    if (entriesErr) {
      return NextResponse.json({ ok: false, error: entriesErr.message }, { status: 500 })
    }

    const entryRows = (entries ?? []) as BracketEntryRow[]

    // 3. Group entries by user
    const byUser = new Map<string, BracketEntryRow[]>()
    for (const e of entryRows) {
      const list = byUser.get(e.user_id) ?? []
      list.push(e)
      byUser.set(e.user_id, list)
    }

    let totalAwarded = 0
    let groupAwarded = 0
    let thirdAwarded = 0
    let knockoutAwarded = 0
    let entriesUpdated = 0

    // 4. Score each user, write subtotals back to bracket_entries.score
    for (const [, userEntries] of byUser) {
      const breakdown = computeFullScore(
        userEntries.map(e => ({ phase: e.phase, picks: e.picks })),
        results,
      )

      groupAwarded += breakdown.group.subtotal
      thirdAwarded += breakdown.third.subtotal
      knockoutAwarded += breakdown.knockout.subtotal
      totalAwarded += breakdown.total

      for (const entry of userEntries) {
        let newScore = 0
        if (entry.phase === 'group') newScore = breakdown.group.subtotal
        else if (entry.phase === 'third') newScore = breakdown.third.subtotal
        else if (entry.phase === 'knockout') newScore = breakdown.knockout.subtotal

        if ((entry.score ?? 0) !== newScore) {
          const { error: updErr } = await supabase
            .from('bracket_entries')
            .update({ score: newScore })
            .eq('id', entry.id)
          if (updErr) {
            return NextResponse.json(
              { ok: false, error: `update failed for entry ${entry.id}: ${updErr.message}` },
              { status: 500 },
            )
          }
          entriesUpdated += 1
        }
      }
    }

    return NextResponse.json({
      ok: true,
      users_scored: byUser.size,
      entries_updated: entriesUpdated,
      total_points_awarded: totalAwarded,
      breakdown_by_phase: {
        group: groupAwarded,
        third: thirdAwarded,
        knockout: knockoutAwarded,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
