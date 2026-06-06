/**
 * GET /api/admin/wc26-matches
 * JOIN wc26_matches + players. Returns per-match fantasy rows.
 *
 * Query params (all optional, multi accepts comma-separated):
 *   round=group_md1,group_md2,r32,r16,qf,sf,final3rd,final
 *   group=A,B,C
 *   team=England,Brazil
 *   position=GK,DEF,MID,FWD
 *   limit=500 (default 500, max 2000)
 *
 * NOTE: also accepts `?opta_id=...` to filter to one player — used by the
 * `/s3` player card Fantasy tab.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAdminAuth } from '@/lib/admin-auth';

export async function GET(req: Request) {
  // Allow public read when filtered by opta_id (used by /s3 player card).
  // For unfiltered admin reads, require auth.
  const url = new URL(req.url);
  const optaFilter = url.searchParams.get('opta_id');
  if (!optaFilter) {
    const authErr = checkAdminAuth(req);
    if (authErr) return authErr;
  }

  const rounds = (url.searchParams.get('round') ?? '').split(',').filter(Boolean);
  const groups = (url.searchParams.get('group') ?? '').split(',').filter(Boolean);
  const teams = (url.searchParams.get('team') ?? '').split(',').filter(Boolean);
  const positions = (url.searchParams.get('position') ?? '').split(',').filter(Boolean);
  const limit = Math.min(2000, Math.max(1, parseInt(url.searchParams.get('limit') ?? '500', 10) || 500));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Try wc26_matches.
  let q = supabase
    .from('wc26_matches')
    .select(`
      id, opta_id, round, opponent, minutes_played, goals, assists, key_passes,
      tackles, interceptions, clean_sheet, yellow_cards, red_cards, fantasy_pts,
      breakdown, played_at,
      players ( short_name, nationality, pos_short, photo_url )
    `)
    .order('fantasy_pts', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (optaFilter) q = q.eq('opta_id', optaFilter);
  if (rounds.length) q = q.in('round', rounds);

  const res = await q;
  if (res.error) {
    // Likely table doesn't exist yet — return empty list rather than 500ing.
    return NextResponse.json({ source: 'none', rows: [], note: 'wc26_matches not available yet' });
  }

  const data = (res.data ?? []) as unknown as Array<Record<string, unknown>>;

  // Apply downstream filters (groups/teams/positions) in-memory because they
  // join through players. With ≤2000 rows this is fine.
  let rows = data.map((r) => {
    const p = (r.players ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      opta_id: r.opta_id,
      short_name: p.short_name,
      nationality: p.nationality,
      pos_short: p.pos_short,
      photo_url: p.photo_url,
      round: r.round,
      opponent: r.opponent,
      minutes_played: r.minutes_played,
      goals: r.goals,
      assists: r.assists,
      key_passes: r.key_passes,
      tackles: r.tackles,
      interceptions: r.interceptions,
      clean_sheet: r.clean_sheet,
      yellow_cards: r.yellow_cards,
      red_cards: r.red_cards,
      fantasy_pts: r.fantasy_pts,
      breakdown: r.breakdown,
      played_at: r.played_at,
    };
  });

  if (teams.length) rows = rows.filter((r) => teams.includes(String(r.nationality)));
  if (positions.length) rows = rows.filter((r) => positions.includes(String(r.pos_short)));
  // Group filter requires nationality → group map; we don't have it server-side
  // (it lives in the /s3 page right now). Defer group filtering to the admin
  // client which already has WC_GROUPS.

  return NextResponse.json({ source: 'wc26_matches', rows, groupsRequested: groups });
}
