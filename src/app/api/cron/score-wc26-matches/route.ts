/**
 * Nightly cron: score recently-played WC 2026 matches.
 *
 * Schedule: 04:00 UTC daily (11pm CT — after all matches likely finished).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`
 *
 * Logic:
 *   1. Get Opta token
 *   2. List WC 2026 matches with matchInfo.lastUpdated within last 36h
 *      AND matchStatus === 'Played'
 *   3. For each: scoreMatch(fixtureId)
 *   4. Return JSON summary
 */

import { NextResponse } from 'next/server';
import { getOptaToken, listWC2026Matches } from '@/lib/opta/match-stats';
import { scoreMatch } from '@/lib/scoring/wc26-match-scorer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOOKBACK_HOURS = 36;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  let token: string;
  try {
    token = await getOptaToken();
  } catch (e) {
    return NextResponse.json(
      { error: 'opta_auth_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  let matches;
  try {
    matches = await listWC2026Matches(token, { since });
  } catch (e) {
    return NextResponse.json(
      { error: 'ma1_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  // Filter to fixtures that have actually been played
  const played = matches.filter(m => {
    const status = m.liveData?.matchDetails?.matchStatus || '';
    return /played|fixturefinished|finished|fulltime|fixturecompleted/i.test(status);
  });

  const errors: string[] = [];
  let totalPlayersScored = 0;
  let totalPlayersSkipped = 0;
  const perMatch: Array<{ fixtureId: string; round?: string; scored: number; skipped: number; tableMissing?: boolean }> = [];

  for (const m of played) {
    const fixtureId = m.matchInfo?.id;
    if (!fixtureId) continue;
    try {
      const r = await scoreMatch(fixtureId);
      totalPlayersScored += r.scored;
      totalPlayersSkipped += r.skipped;
      if (r.errors.length) errors.push(...r.errors);
      perMatch.push({
        fixtureId,
        round: r.round,
        scored: r.scored,
        skipped: r.skipped,
        ...(r.tableMissing ? { tableMissing: true } : {}),
      });
    } catch (e) {
      errors.push(`fixture ${fixtureId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    lookbackSince: since.toISOString(),
    matchesConsidered: matches.length,
    matchesPlayed: played.length,
    matchesProcessed: perMatch.length,
    totalPlayersScored,
    totalPlayersSkipped,
    perMatch,
    errors,
    scoringVersion: 'v1.4',
  });
}
