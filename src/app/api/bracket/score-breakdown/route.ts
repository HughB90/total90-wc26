// GET /api/bracket/score-breakdown?userId=...
//
// Returns the full ScoreBreakdown for a single user. Read-only, no admin auth
// required — the breakdown already mirrors what users see on their own bracket
// page. Per-phase visibility lockdown comes in Pass 2.
//
// Powers the future 4-column per-team breakdown view.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeFullScore, type BracketResults } from '@/lib/bracket/scoring'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

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

    const { data: entries, error: entriesErr } = await supabase
      .from('bracket_entries')
      .select('phase, picks')
      .eq('user_id', userId)

    if (entriesErr) {
      return NextResponse.json({ ok: false, error: entriesErr.message }, { status: 500 })
    }

    const breakdown = computeFullScore(
      (entries ?? []).map((e: { phase: string; picks: unknown }) => ({
        phase: e.phase,
        picks: e.picks,
      })),
      results,
    )

    return NextResponse.json({ ok: true, breakdown })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
