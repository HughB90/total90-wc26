/**
 * PATCH /api/admin/intelligence/[opta_id]
 * Body: { starting_xi: 1 | 2 | 3 | null }
 *
 * Recomputes T90 + 10k via computeT90() (v1.2 port), persists to
 * player_intelligence (or legacy s3_players), returns new values.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAdminAuth } from '@/lib/admin-auth';
import { computeT90, tierOf } from '@/lib/t90-formula';

type PatchBody = { starting_xi: 1 | 2 | 3 | null };

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ opta_id: string }> }
) {
  const authErr = checkAdminAuth(req);
  if (authErr) return authErr;

  const { opta_id } = await ctx.params;
  if (!opta_id) return NextResponse.json({ error: 'missing opta_id' }, { status: 400 });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const xi = body.starting_xi;
  if (xi !== null && ![1, 2, 3].includes(xi)) {
    return NextResponse.json({ error: 'starting_xi must be 1, 2, 3, or null' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Pull current row to recompute against. Try new schema first.
  let cat_score: number | null = null;
  let fifa_overall: number | null = null;
  let fifa_potential: number | null = null;
  let wc_age: number | null = null;
  let nationality: string | null = null;
  let source: 'player_intelligence' | 's3_players' = 's3_players';

  const fancy = await supabase
    .from('player_intelligence')
    .select('cat_score, fifa_overall, fifa_potential, players(nationality, wc_age)')
    .eq('opta_id', opta_id)
    .maybeSingle();

  if (!fancy.error && fancy.data) {
    source = 'player_intelligence';
    cat_score = (fancy.data as Record<string, unknown>).cat_score as number | null;
    fifa_overall = (fancy.data as Record<string, unknown>).fifa_overall as number | null;
    fifa_potential = (fancy.data as Record<string, unknown>).fifa_potential as number | null;
    const p = (fancy.data as Record<string, unknown>).players as Record<string, unknown> | undefined;
    nationality = (p?.nationality as string | null) ?? null;
    wc_age = (p?.wc_age as number | null) ?? null;
  } else {
    const legacy = await supabase
      .from('s3_players')
      .select('cat_score, fifa_overall, fifa_potential, wc_age, nationality')
      .eq('opta_id', opta_id)
      .maybeSingle();
    if (legacy.error || !legacy.data) {
      return NextResponse.json({ error: legacy.error?.message ?? 'player not found' }, { status: 404 });
    }
    cat_score = legacy.data.cat_score as number | null;
    fifa_overall = legacy.data.fifa_overall as number | null;
    fifa_potential = legacy.data.fifa_potential as number | null;
    wc_age = legacy.data.wc_age as number | null;
    nationality = legacy.data.nationality as string | null;
  }

  // Recompute via canonical helper
  const result = computeT90({
    cat_score,
    fifa_overall,
    fifa_potential,
    starting_xi: xi,
    wc_age,
    nationality,
  });

  // Persist
  const now = new Date().toISOString();
  if (source === 'player_intelligence') {
    const { error: updErr } = await supabase
      .from('player_intelligence')
      .update({
        starting_xi: xi,
        t90_score: result.t90,
        tenk_score: result.tenk,
        updated_at: now,
      })
      .eq('opta_id', opta_id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  } else {
    const { error: updErr } = await supabase
      .from('s3_players')
      .update({
        starting_xi: xi,
        t90_score: result.t90,
        tenk_score: result.tenk,
        t90_updated_at: now,
      })
      .eq('opta_id', opta_id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    source,
    opta_id,
    starting_xi: xi,
    t90_score: result.t90,
    tenk_score: result.tenk,
    rank_band: result.rank_band,
    tier_used: tierOf(nationality),
    nationality,
    updated_at: now,
  });
}
