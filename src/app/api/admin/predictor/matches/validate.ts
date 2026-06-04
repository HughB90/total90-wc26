/**
 * Pure validation helpers for the admin predictor-matches routes.
 *
 * Extracted so the Node built-in test runner can exercise them without
 * pulling Next's runtime (no `next/server` import).
 *
 *   - validateAdminAuth: shared by GET /matches and PATCH /matches/[id].
 *     Reads PREDICTOR_ADMIN_KEY off process.env each call (so tests can
 *     mutate it between cases) and the `x-admin-key` request header.
 *
 *   - validateMatchPatch: parses + type-checks a PATCH body. All fields
 *     optional, all admin-friendly (NO business-rule validation — Hugh
 *     can enter anything for testing).
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; body: { ok: false; error: string } }

export function validateAdminAuth(request: Request): AuthResult {
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

  return { ok: true }
}

// ---------------------------------------------------------------------------
// PATCH body
// ---------------------------------------------------------------------------

export interface MatchPatchUpdate {
  home_score?: number | null
  away_score?: number | null
  went_to_pks?: boolean
  pk_winner_team_code?: string | null
  goalscorers?: unknown[]
  status?: string
}

export type PatchValidateResult =
  | { ok: true; update: MatchPatchUpdate }
  | { ok: false; status: number; body: { ok: false; error: string } }

function isNullableInt(v: unknown): v is number | null {
  if (v === null) return true
  return typeof v === 'number' && Number.isInteger(v)
}

export function validateMatchPatchBody(raw: unknown): PatchValidateResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 422, body: { ok: false, error: 'invalid_body' } }
  }

  const body = raw as Record<string, unknown>
  const update: MatchPatchUpdate = {}
  const provided = Object.keys(body)
  if (provided.length === 0) {
    return { ok: false, status: 422, body: { ok: false, error: 'empty_body' } }
  }

  if ('home_score' in body) {
    if (!isNullableInt(body.home_score)) {
      return {
        ok: false,
        status: 422,
        body: { ok: false, error: 'home_score must be integer or null' },
      }
    }
    update.home_score = body.home_score as number | null
  }

  if ('away_score' in body) {
    if (!isNullableInt(body.away_score)) {
      return {
        ok: false,
        status: 422,
        body: { ok: false, error: 'away_score must be integer or null' },
      }
    }
    update.away_score = body.away_score as number | null
  }

  if ('went_to_pks' in body) {
    if (typeof body.went_to_pks !== 'boolean') {
      return {
        ok: false,
        status: 422,
        body: { ok: false, error: 'went_to_pks must be boolean' },
      }
    }
    update.went_to_pks = body.went_to_pks
  }

  if ('pk_winner_team_code' in body) {
    if (body.pk_winner_team_code !== null && typeof body.pk_winner_team_code !== 'string') {
      return {
        ok: false,
        status: 422,
        body: { ok: false, error: 'pk_winner_team_code must be string or null' },
      }
    }
    update.pk_winner_team_code = body.pk_winner_team_code as string | null
  }

  if ('goalscorers' in body) {
    if (!Array.isArray(body.goalscorers)) {
      return {
        ok: false,
        status: 422,
        body: { ok: false, error: 'goalscorers must be an array' },
      }
    }
    update.goalscorers = body.goalscorers
  }

  if ('status' in body) {
    if (typeof body.status !== 'string') {
      return {
        ok: false,
        status: 422,
        body: { ok: false, error: 'status must be string' },
      }
    }
    update.status = body.status
  }

  return { ok: true, update }
}
