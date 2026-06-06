/**
 * Opta match-stats client for WC 2026.
 *
 * Auth pattern: copied from sheets/opta-tournament-to-sheet.js
 *   HMAC-SHA512(outletKey + timestamp + secretKey) → POST OAuth → Bearer token (8h)
 *
 * Endpoints (see ~/.openclaw/workspace/t90-fantasy-wc/OPTA-API-REFERENCE.md):
 *   - MA1 /soccerdata/match/{OUTLET_KEY}?tmcl=...    (list fixtures)
 *   - MA2 /soccerdata/matchstats/{OUTLET_KEY}?fx=... (per-player stats)
 *
 * Credentials:
 *   - Production: env vars OPTA_OUTLET_KEY, OPTA_SECRET_KEY
 *   - Local dev:  falls back to ~/.openclaw/workspace/keys/opta-api.json
 */

import * as crypto from 'crypto';

export const WC2026_TMCL = '873cbl9cd9butm4air0mugxzo';
export const WC2026_COMP = '70excpe1synn9kadnbppahdn7';

export type WC26Round =
  | 'group_md1'
  | 'group_md2'
  | 'group_md3'
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter_final'
  | 'semi_final'
  | 'third_place'
  | 'final';

export interface OptaMatch {
  matchInfo: {
    id: string;
    date?: string;
    time?: string;
    lastUpdated?: string;
    week?: string;
    stage?: { name?: string; longName?: string };
    series?: { name?: string; longName?: string };
    contestant?: Array<{
      id: string;
      name: string;
      shortName?: string;
      code?: string;
      position?: 'home' | 'away';
    }>;
  };
  liveData?: {
    matchDetails?: {
      matchStatus?: string;
      periodId?: number;
      scores?: {
        ft?: { home: number; away: number };
        et?: { home: number; away: number };
        pen?: { home: number; away: number };
        total?: { home: number; away: number };
      };
    };
  };
}

export interface OptaMatchStatsResponse {
  matchInfo: OptaMatch['matchInfo'];
  liveData?: {
    matchDetails?: OptaMatch['liveData'] extends infer T ? T extends { matchDetails?: infer M } ? M : never : never;
    lineUp?: Array<{
      contestantId: string;
      formationUsed?: string;
      stat?: Array<{ type: string; value: string | number; fh?: string; sh?: string }>;
      player?: Array<{
        playerId: string;
        firstName?: string;
        lastName?: string;
        shortFirstName?: string;
        shortLastName?: string;
        matchName?: string;
        position?: string;
        positionSide?: string;
        stat?: Array<{ type: string; value: string | number; fh?: string; sh?: string }>;
      }>;
    }>;
  };
}

// ---------- Credential loading ----------
interface OptaCreds {
  outletKey: string;
  secretKey: string;
}

let _credsCache: OptaCreds | null = null;

async function loadOptaCreds(): Promise<OptaCreds> {
  if (_credsCache) return _credsCache;

  const envOutlet = process.env.OPTA_OUTLET_KEY;
  const envSecret = process.env.OPTA_SECRET_KEY;
  if (envOutlet && envSecret) {
    _credsCache = { outletKey: envOutlet, secretKey: envSecret };
    return _credsCache;
  }

  // Dev fallback: read keys/opta-api.json from the workspace. Lazy dynamic
  // imports so Turbopack/edge bundling doesn't trace fs/path/os into the
  // production build (env vars are always set in prod).
  if (process.env.NEXT_RUNTIME === 'edge' || process.env.VERCEL) {
    throw new Error(
      'Opta credentials missing in deployed environment. Set OPTA_OUTLET_KEY + OPTA_SECRET_KEY in Vercel env.'
    );
  }

  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');

    const candidates = [
      path.join(os.homedir(), '.openclaw/workspace/keys/opta-api.json'),
      path.resolve(process.cwd(), '../keys/opta-api.json'),
      path.resolve(process.cwd(), '../../keys/opta-api.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j.outletApiKey && j.secretKey1) {
          _credsCache = { outletKey: j.outletApiKey, secretKey: j.secretKey1 };
          return _credsCache;
        }
      }
    }
  } catch {
    // fall through to throw
  }

  throw new Error(
    'Opta credentials not found. Set OPTA_OUTLET_KEY + OPTA_SECRET_KEY env vars, or ensure ~/.openclaw/workspace/keys/opta-api.json exists.'
  );
}

// ---------- Token caching (8h) ----------
interface CachedToken {
  token: string;
  issuedAt: number; // ms epoch
}
let _tokenCache: CachedToken | null = null;
const TOKEN_TTL_MS = 7 * 60 * 60 * 1000; // 7h (refresh 1h before expiry)

export async function getOptaToken(): Promise<string> {
  if (_tokenCache && Date.now() - _tokenCache.issuedAt < TOKEN_TTL_MS) {
    return _tokenCache.token;
  }

  const { outletKey, secretKey } = await loadOptaCreds();
  const timestamp = Date.now().toString();
  const hash = crypto
    .createHash('sha512')
    .update(outletKey + timestamp + secretKey)
    .digest('hex');

  const postBody = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'b2b-feeds-auth',
  }).toString();

  const res = await fetch(
    `https://oauth.performgroup.com/oauth/token/${outletKey}?_fmt=json&_rt=b`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${hash}`,
        Timestamp: timestamp,
      },
      body: postBody,
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Opta token request failed: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) {
    throw new Error(`Opta token response missing access_token: ${JSON.stringify(j)}`);
  }

  _tokenCache = { token: j.access_token, issuedAt: Date.now() };
  return _tokenCache.token;
}

// ---------- Generic GET with retry ----------
async function optaGet<T = unknown>(token: string, urlPath: string, label = 'opta'): Promise<T> {
  const delays = [1000, 3000, 9000];
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(`https://api.performfeeds.com${urlPath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`${label} HTTP ${res.status}: ${body.slice(0, 300)}`);
        // 4xx → no retry
        if (res.status >= 400 && res.status < 500) throw err;
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (lastErr.message.includes('HTTP 4')) throw lastErr;
      if (attempt < delays.length) {
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
  }
  throw lastErr || new Error(`${label} failed after retries`);
}

// ---------- Public API ----------

/**
 * List WC 2026 matches. By default returns ALL fixtures.
 * If `opts.since` is given, returns only fixtures with matchInfo.lastUpdated
 * (or matchInfo.date as fallback) >= since.
 */
export async function listWC2026Matches(
  token: string,
  opts?: { since?: Date }
): Promise<OptaMatch[]> {
  const { outletKey } = await loadOptaCreds();
  const j = await optaGet<{ match?: OptaMatch[] }>(
    token,
    `/soccerdata/match/${outletKey}?tmcl=${WC2026_TMCL}&_rt=b&_fmt=json&_pgSz=200`,
    'MA1'
  );
  const matches = j.match || [];
  if (!opts?.since) return matches;

  const sinceMs = opts.since.getTime();
  return matches.filter(m => {
    const lu = m.matchInfo?.lastUpdated;
    if (lu) {
      const t = Date.parse(lu);
      if (!isNaN(t)) return t >= sinceMs;
    }
    const d = m.matchInfo?.date;
    if (d) {
      const t = Date.parse(d);
      if (!isNaN(t)) return t >= sinceMs;
    }
    return false;
  });
}

/**
 * Get full match stats for a single fixture (MA2).
 */
export async function getMatchStats(
  token: string,
  fixtureId: string
): Promise<OptaMatchStatsResponse> {
  const { outletKey } = await loadOptaCreds();
  const j = await optaGet<{ matchInfo?: OptaMatch['matchInfo']; liveData?: OptaMatchStatsResponse['liveData'] }>(
    token,
    `/soccerdata/matchstats/${outletKey}?fx=${fixtureId}&detailed=yes&_rt=b&_fmt=json`,
    `MA2 ${fixtureId}`
  );
  return {
    matchInfo: (j.matchInfo as OptaMatch['matchInfo']) || ({ id: fixtureId } as OptaMatch['matchInfo']),
    liveData: j.liveData,
  };
}

/**
 * Map an Opta match to our WC26Round enum.
 *
 * Looks at:
 *   - matchInfo.stage.name / longName
 *   - matchInfo.series.name / longName
 *   - matchInfo.week (e.g. "1", "2", "3" for group stage matchday)
 *   - matchInfo.date as tiebreaker
 *
 * Throws if unmappable.
 */
export function determineRound(match: OptaMatch | OptaMatchStatsResponse): WC26Round {
  const mi = match.matchInfo;
  if (!mi) throw new Error('determineRound: matchInfo missing');

  const stage = mi.stage?.name || mi.stage?.longName || '';
  const series = mi.series?.name || mi.series?.longName || '';
  const week = String(mi.week || '');
  const blob = `${stage} ${series}`.toLowerCase().trim();

  // Knockout rounds (check before "group" since wording can overlap)
  if (/(^|\W)final\W*$|^final$/i.test(stage) || blob === 'final' || /\bfinal\b/.test(blob) && !blob.includes('quarter') && !blob.includes('semi') && !blob.includes('3rd') && !blob.includes('third')) {
    if (blob.includes('3rd') || blob.includes('third')) return 'third_place';
    if (blob.includes('quarter')) return 'quarter_final';
    if (blob.includes('semi')) return 'semi_final';
    return 'final';
  }
  if (blob.includes('3rd place') || blob.includes('third place') || blob.includes('3rd-place') || blob.includes('play-off for third')) {
    return 'third_place';
  }
  if (blob.includes('semi')) return 'semi_final';
  if (blob.includes('quarter')) return 'quarter_final';
  if (blob.includes('round of 16') || blob.includes('last 16') || blob.includes('8th final') || blob.includes('r16')) {
    return 'round_of_16';
  }
  if (blob.includes('round of 32') || blob.includes('last 32') || blob.includes('r32')) {
    return 'round_of_32';
  }

  // Group stage — use week / matchday
  if (blob.includes('group') || blob.includes('matchday') || week) {
    // Parse matchday number from week first, then from stage/series strings
    let md: number | null = null;
    if (/^\d+$/.test(week)) md = parseInt(week, 10);
    if (md === null) {
      const mdMatch = blob.match(/matchday\s*[-–]?\s*(\d+)/i) || blob.match(/md\s*[-–]?\s*(\d+)/i) || blob.match(/\b(\d+)\b/);
      if (mdMatch) md = parseInt(mdMatch[1], 10);
    }
    if (md === 1) return 'group_md1';
    if (md === 2) return 'group_md2';
    if (md === 3) return 'group_md3';

    // Fall back to date — WC 2026 group stage runs roughly Jun 11–27
    if (mi.date) {
      const d = mi.date.slice(0, 10); // YYYY-MM-DD
      if (d >= '2026-06-11' && d <= '2026-06-17') return 'group_md1';
      if (d >= '2026-06-18' && d <= '2026-06-22') return 'group_md2';
      if (d >= '2026-06-23' && d <= '2026-06-27') return 'group_md3';
    }
  }

  // Final tiebreaker: pure date-based for WC 2026 calendar
  if (mi.date) {
    const d = mi.date.slice(0, 10);
    if (d >= '2026-06-28' && d <= '2026-07-03') return 'round_of_32';
    if (d >= '2026-07-04' && d <= '2026-07-07') return 'round_of_16';
    if (d >= '2026-07-09' && d <= '2026-07-11') return 'quarter_final';
    if (d >= '2026-07-14' && d <= '2026-07-15') return 'semi_final';
    if (d === '2026-07-18') return 'third_place';
    if (d === '2026-07-19') return 'final';
  }

  throw new Error(
    `determineRound: unmappable match — stage="${stage}" series="${series}" week="${week}" date="${mi.date || ''}"`
  );
}
