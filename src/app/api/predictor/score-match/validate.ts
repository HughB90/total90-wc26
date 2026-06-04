/**
 * Pure validation helper for POST /api/predictor/score-match.
 *
 * Extracted into its own module (no next/server import) so the Node
 * built-in test runner can exercise it without pulling Next's runtime.
 *
 *   - Reads PREDICTOR_ADMIN_KEY off process.env each call (so tests can
 *     mutate it between cases).
 *   - Reads the `x-admin-key` header off the Request.
 *   - Parses the JSON body and extracts a trimmed `match_id` string.
 *
 * Returns either { ok: true, matchId } or a structured error with the
 * HTTP status + JSON body the route should send.
 */

export type ValidateResult =
  | { ok: true; matchId: string }
  | { ok: false; status: number; body: { ok: false; error: string } }

export async function validateScoreMatchRequest(
  request: Request,
): Promise<ValidateResult> {
  const adminKey = process.env.PREDICTOR_ADMIN_KEY
  if (!adminKey) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: 'PREDICTOR_ADMIN_KEY env var not configured on this deployment.',
      },
    }
  }

  const providedKey = request.headers.get('x-admin-key') ?? ''
  if (providedKey !== adminKey) {
    return { ok: false, status: 401, body: { ok: false, error: 'unauthorized' } }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_json_body' } }
  }

  const matchId =
    body &&
    typeof body === 'object' &&
    typeof (body as { match_id?: unknown }).match_id === 'string'
      ? (body as { match_id: string }).match_id.trim()
      : ''

  if (!matchId) {
    return { ok: false, status: 400, body: { ok: false, error: 'match_id_required' } }
  }

  return { ok: true, matchId }
}
