/**
 * GET /api/admin/intelligence
 * JOIN players + player_intelligence (or s3_players legacy view).
 *
 * Returns rows like:
 *   { opta_id, short_name, nationality, pos_short, starting_xi, t90_score,
 *     cat_score, tenk_score, fifa_overall, fifa_potential, vote_count,
 *     sign_count, sell_count, sack_count, t90_rank, updated_at, photo_url }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET(req: Request) {
  const authErr = checkAdminAuth(req);
  if (authErr) return authErr;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Try new schema: player_intelligence joined with players via opta_id.
  const fancy = await supabase
    .from('player_intelligence')
    .select(`
      opta_id, starting_xi, t90_score, cat_score, tenk_score, fifa_overall,
      fifa_potential, vote_count, sign_count, sell_count, sack_count,
      t90_rank, updated_at,
      players ( short_name, nationality, pos_short, photo_url )
    `)
    .order('t90_score', { ascending: false, nullsFirst: false })
    .limit(2000);

  if (!fancy.error && fancy.data && fancy.data.length > 0) {
    const rows = (fancy.data as unknown as Array<Record<string, unknown>>).map((r) => {
      const p = (r.players ?? {}) as Record<string, unknown>;
      return {
        opta_id: r.opta_id,
        short_name: p.short_name,
        nationality: p.nationality,
        pos_short: p.pos_short,
        photo_url: p.photo_url,
        starting_xi: r.starting_xi,
        t90_score: r.t90_score,
        cat_score: r.cat_score,
        tenk_score: r.tenk_score,
        fifa_overall: r.fifa_overall,
        fifa_potential: r.fifa_potential,
        vote_count: r.vote_count,
        sign_count: r.sign_count,
        sell_count: r.sell_count,
        sack_count: r.sack_count,
        t90_rank: r.t90_rank,
        updated_at: r.updated_at,
      };
    });
    return NextResponse.json({ source: 'player_intelligence', rows });
  }

  // Fall back to s3_players.
  const legacy = await supabase
    .from('s3_players')
    .select('opta_id, short_name, nationality, pos_short, position, photo_url, starting_xi, t90_score, cat_score, tenk_score, fifa_overall, fifa_potential, vote_count, sign_count, sell_count, sack_count, t90_rank, t90_updated_at, updated_at')
    .order('t90_score', { ascending: false, nullsFirst: false })
    .limit(2000);

  if (legacy.error) {
    return NextResponse.json({ error: legacy.error.message }, { status: 500 });
  }

  const rows = (legacy.data ?? []).map((r: Record<string, unknown>) => ({
    opta_id: r.opta_id,
    short_name: r.short_name,
    nationality: r.nationality,
    pos_short: r.pos_short ?? r.position,
    photo_url: r.photo_url,
    starting_xi: r.starting_xi,
    t90_score: r.t90_score,
    cat_score: r.cat_score,
    tenk_score: r.tenk_score,
    fifa_overall: r.fifa_overall,
    fifa_potential: r.fifa_potential,
    vote_count: r.vote_count,
    sign_count: r.sign_count,
    sell_count: r.sell_count,
    sack_count: r.sack_count,
    t90_rank: r.t90_rank,
    updated_at: r.t90_updated_at ?? r.updated_at,
  }));

  return NextResponse.json({ source: 's3_players', rows });
}
