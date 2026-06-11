/**
 * Opta StatsPerform Soccerdata API client (server-only).
 *
 * Auth pattern lifted from sheets/opta-tournament-to-sheet.js — HMAC-SHA512
 * over (outletKey + timestamp + secretKey) → Bearer token. Token is good
 * for ~1 hour; we cache in-process.
 *
 * Required env vars (set in Vercel + .env.local):
 *   OPTA_OUTLET — the outlet API key (a.k.a. outletKey in the JSON file)
 *   OPTA_KEY    — same as OPTA_OUTLET in our license (kept distinct for clarity)
 *   OPTA_SECRET — secret key 1
 *
 * Do NOT import keys/opta-api.json at runtime — that file is workspace-only
 * and won't ship to Vercel.
 */

import crypto from 'node:crypto'

const TOKEN_HOST = 'oauth.performgroup.com'
const API_HOST = 'api.performfeeds.com'

let cachedToken: { token: string; expiresAt: number } | null = null

function getEnvOrThrow(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} env var not set`)
  return v
}

export async function getOptaToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }
  const outletKey = getEnvOrThrow('OPTA_OUTLET')
  const secretKey = getEnvOrThrow('OPTA_SECRET')
  const timestamp = Date.now().toString()
  const hash = crypto
    .createHash('sha512')
    .update(outletKey + timestamp + secretKey)
    .digest('hex')

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'b2b-feeds-auth',
  })

  const url = `https://${TOKEN_HOST}/oauth/token/${outletKey}?_fmt=json&_rt=b`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${hash}`,
      Timestamp: timestamp,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Opta token request failed: ${res.status} ${text.slice(0, 300)}`)
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) {
    throw new Error('Opta token response missing access_token')
  }
  const expiresIn = json.expires_in ?? 3600
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  }
  return json.access_token
}

export async function optaGet<T = unknown>(urlPath: string): Promise<T> {
  const token = await getOptaToken()
  const url = `https://${API_HOST}${urlPath}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Opta GET ${urlPath} failed: ${res.status} ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Tournament constants (see workspace/TOOLS.md § "WC 2026 Roster Source")
// ---------------------------------------------------------------------------

export const WC26_TOURNAMENT_CALENDAR_UUID = '873cbl9cd9butm4air0mugxzo'

/**
 * Build the MA1 (matches) URL for the WC26 tournament. We try `match`
 * (Opta's standard MA1 path on this license). If your license uses a
 * different name, surface the error from optaGet and we'll adjust.
 */
export function buildWc26MatchesUrl(opts: { live?: boolean; pageSize?: number } = {}): string {
  const outlet = process.env.OPTA_OUTLET ?? ''
  const params = new URLSearchParams({
    tmcl: WC26_TOURNAMENT_CALENDAR_UUID,
    _rt: 'b',
    _fmt: 'json',
    _pgSz: String(opts.pageSize ?? 200),
  })
  if (opts.live) params.set('live', 'yes')
  return `/soccerdata/match/${outlet}?${params.toString()}`
}

/**
 * Test-only token reset (so unit tests don't carry cache across runs).
 */
export function _resetOptaTokenCache() {
  cachedToken = null
}
