// GET /api/bracket/results
//
// Public endpoint. Returns the canonical bracket truth from `bracket_config`:
//   - group_results: per-group ordered team array (1st..4th)
//   - third_results: 8 team names in FIFA "winner-vs-3rd" slot order
//   - knockout_results: matchId → winner team name (admin-curated)
//
// Used by the bracket page on mount to hydrate group standings, derive the
// real R32 matchups, and lock group/3rd-place picks once group_results is set.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 60

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data, error } = await supabase
      .from('bracket_config')
      .select('key, value')
      .in('key', ['group_results', 'third_results', 'knockout_results'])

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    const out: { group_results: Record<string, string[]>; third_results: string[]; knockout_results: Record<string, string> } = {
      group_results: {},
      third_results: [],
      knockout_results: {},
    }
    for (const row of data ?? []) {
      const { key, value } = row as { key: string; value: unknown }
      if (key === 'group_results' && value && typeof value === 'object') {
        out.group_results = value as Record<string, string[]>
      } else if (key === 'third_results' && Array.isArray(value)) {
        out.third_results = value as string[]
      } else if (key === 'knockout_results' && value && typeof value === 'object') {
        out.knockout_results = value as Record<string, string>
      }
    }
    return NextResponse.json({ ok: true, ...out })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
