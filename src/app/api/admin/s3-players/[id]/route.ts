/**
 * /api/admin/s3-players/[id]
 * 
 * Admin-only endpoint for inline editing of S3 player scores with cascading recomputation.
 * 
 * PATCH /api/admin/s3-players/{id}
 *   - Auth: Bearer token matching ADMIN_PASSWORD env var (or hardcoded fallback)
 *   - Body: { cat_score?: number, t90_score?: number, starting_xi?: 1|2|3 }
 *   - Behavior:
 *     • cat_score override → recompute T90 + tenk + tenkDyn, set admin_override_cat=true
 *     • t90_score override (cat_score NOT provided) → set T90, set admin_override_t90=true, do NOT recompute tenk
 *     • starting_xi override → recompute T90 + tenk using new depth, set admin_override_xi=true
 *     • Always set admin_overridden_at = now()
 *     • After write, re-rank ALL rows by tenk_score DESC
 *   - Returns: updated row + new rank
 * 
 * DELETE /api/admin/s3-players/{id}/override
 *   - Clears all admin_override_* flags, nulls admin_overridden_at
 *   - Next sync re-imports values from sheet
 *   - Re-ranks all rows after clear
 */

import { NextRequest, NextResponse } from 'next/server';
import { recomputeScores } from '@/lib/scoring/wc-t90-recompute';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tituygkbondyjhzomwji.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Total90Ba!!'; // Fallback to current hardcoded value

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[s3-players API] SUPABASE_SERVICE_ROLE_KEY not set');
}

// --- Auth helper ---
function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7);
  return token === ADMIN_PASSWORD;
}

// --- Supabase fetch helper ---
async function supabaseFetch(path: string, options: RequestInit = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY || '',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Re-rank helper ---
async function reRankAllPlayers(): Promise<void> {
  // Fetch all players sorted by tenk_score DESC
  const players = await supabaseFetch('/rest/v1/s3_players?select=id,tenk_score&order=tenk_score.desc.nullslast');
  
  // Build bulk update payload
  const updates = players.map((p: any, idx: number) => ({
    id: p.id,
    t90_rank: idx + 1,
  }));

  // Bulk update ranks (Supabase doesn't have native bulk update, so we'll do batch PATCH)
  // For simplicity with 1248 rows, we'll do a single UPDATE via RPC or raw SQL
  // Using raw SQL via PostgREST rpc endpoint (if available) or fall back to individual updates
  
  // Since we don't have an RPC set up, let's use a simpler approach:
  // Update ranks in batches of 100 to avoid overwhelming the API
  const BATCH_SIZE = 100;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((u: any) =>
        supabaseFetch(`/rest/v1/s3_players?id=eq.${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ t90_rank: u.t90_rank }),
        })
      )
    );
  }
}

// --- PATCH handler ---
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { cat_score, t90_score, starting_xi } = body;

  if (cat_score === undefined && t90_score === undefined && starting_xi === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    // Fetch current row
    const [current] = await supabaseFetch(`/rest/v1/s3_players?id=eq.${id}&select=*`);
    if (!current) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Prepare update payload
    const updates: any = {
      admin_overridden_at: new Date().toISOString(),
    };

    // Handle cat_score override
    if (cat_score !== undefined) {
      const recomputed = recomputeScores({
        catScore: cat_score,
        ovr: current.fifa_overall,
        pot: current.fifa_potential,
        wcAge: current.wc_age,
        nation: current.nationality,
        startingXi: current.starting_xi || 1,
      });
      
      updates.cat_score = cat_score;
      updates.t90_score = recomputed.t90;
      updates.tenk_score = recomputed.tenk;
      updates.tenk_dynasty = recomputed.tenkDyn;
      updates.admin_override_cat = true;
    }
    // Handle t90_score override (only if cat_score NOT provided)
    else if (t90_score !== undefined) {
      updates.t90_score = t90_score;
      updates.admin_override_t90 = true;
      // Do NOT recompute tenk when T90 is directly overridden
    }

    // Handle starting_xi override
    if (starting_xi !== undefined) {
      updates.starting_xi = starting_xi;
      updates.admin_override_xi = true;
      
      // If cat_score was NOT also updated, recompute using current cat_score + new depth
      if (cat_score === undefined) {
        const recomputed = recomputeScores({
          catScore: current.cat_score || 60,
          ovr: current.fifa_overall,
          pot: current.fifa_potential,
          wcAge: current.wc_age,
          nation: current.nationality,
          startingXi: starting_xi,
        });
        
        updates.t90_score = recomputed.t90;
        updates.tenk_score = recomputed.tenk;
        updates.tenk_dynasty = recomputed.tenkDyn;
      }
    }

    // Apply update
    const [updated] = await supabaseFetch(`/rest/v1/s3_players?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    // Re-rank all players
    await reRankAllPlayers();

    // Fetch updated row with new rank
    const [final] = await supabaseFetch(`/rest/v1/s3_players?id=eq.${id}&select=*`);

    return NextResponse.json(final);
  } catch (error: any) {
    console.error('[PATCH s3-players] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- DELETE handler (clear overrides) ---
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const isOverrideReset = url.pathname.endsWith('/override');

  if (!isOverrideReset) {
    return NextResponse.json({ error: 'Invalid DELETE path' }, { status: 400 });
  }

  try {
    // Clear all override flags
    const updates = {
      admin_override_cat: false,
      admin_override_t90: false,
      admin_override_xi: false,
      admin_overridden_at: null,
    };

    const [updated] = await supabaseFetch(`/rest/v1/s3_players?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    // Re-rank all players
    await reRankAllPlayers();

    // Fetch updated row
    const [final] = await supabaseFetch(`/rest/v1/s3_players?id=eq.${id}&select=*`);

    return NextResponse.json(final);
  } catch (error: any) {
    console.error('[DELETE s3-players override] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
