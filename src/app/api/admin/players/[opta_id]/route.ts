/**
 * PATCH /api/admin/players/[opta_id]
 * Edit identity fields. Accepts subset of:
 *   { full_name?, short_name?, club?, wc_group?, wc_active? }
 *
 * Writes to `players` if it exists, else `s3_players` with the legacy column
 * names (full_name→name, wc_active→wc26_participant).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAdminAuth } from '@/lib/admin-auth';

type PatchBody = {
  full_name?: string;
  short_name?: string;
  club?: string;
  wc_group?: string;
  wc_active?: boolean;
};

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Try new `players` table first.
  const newTable = await supabase.from('players').select('opta_id').eq('opta_id', opta_id).maybeSingle();
  if (!newTable.error && newTable.data) {
    const upd: Record<string, unknown> = {};
    if (body.full_name !== undefined) upd.full_name = body.full_name;
    if (body.short_name !== undefined) upd.short_name = body.short_name;
    if (body.club !== undefined) upd.club = body.club;
    if (body.wc_group !== undefined) upd.wc_group = body.wc_group;
    if (body.wc_active !== undefined) upd.wc_active = body.wc_active;
    upd.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('players')
      .update(upd)
      .eq('opta_id', opta_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ source: 'players', row: data });
  }

  // Fall back to s3_players with column name remap.
  const upd: Record<string, unknown> = {};
  if (body.full_name !== undefined) upd.name = body.full_name;
  if (body.short_name !== undefined) upd.short_name = body.short_name;
  if (body.club !== undefined) upd.club = body.club;
  if (body.wc_active !== undefined) upd.wc26_participant = body.wc_active;
  // wc_group has no home on s3_players — silently ignored for now.

  const { data, error } = await supabase
    .from('s3_players')
    .update(upd)
    .eq('opta_id', opta_id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: 's3_players', row: data });
}
