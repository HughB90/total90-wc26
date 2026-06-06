/**
 * GET /api/admin/players
 * Returns identity-only player rows for the Admin → Players tab.
 *
 * Reads from the new `players` table if it exists, otherwise falls back to
 * `s3_players` (the legacy union table). Either way the response shape is
 * normalized to:
 *   { id, opta_id, full_name, short_name, nationality, pos_short, position,
 *     club, age, wc_age, wc_group, wc_active, photo_url, updated_at }
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

  // Try the new `players` table first.
  const newTable = await supabase
    .from('players')
    .select('id, opta_id, full_name, short_name, nationality, pos_short, position, club, age, wc_age, wc_group, wc_active, photo_url, updated_at')
    .order('full_name', { ascending: true })
    .limit(2000);

  if (!newTable.error && newTable.data && newTable.data.length > 0) {
    return NextResponse.json({ source: 'players', rows: newTable.data });
  }

  // Fall back to s3_players. Column names differ — we normalize.
  const legacy = await supabase
    .from('s3_players')
    .select('id, opta_id, name, short_name, nationality, position, pos_short, club, age, wc_age, photo_url, wc26_participant, updated_at, t90_updated_at')
    .order('name', { ascending: true })
    .limit(2000);

  if (legacy.error) {
    return NextResponse.json({ error: legacy.error.message }, { status: 500 });
  }

  const rows = (legacy.data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id,
    opta_id: p.opta_id,
    full_name: p.name,
    short_name: p.short_name,
    nationality: p.nationality,
    pos_short: p.pos_short ?? p.position,
    position: p.position,
    club: p.club,
    age: p.age,
    wc_age: p.wc_age,
    wc_group: null,           // not stored on s3_players
    wc_active: !!p.wc26_participant,
    photo_url: p.photo_url,
    updated_at: p.updated_at ?? p.t90_updated_at,
  }));

  return NextResponse.json({ source: 's3_players', rows });
}
