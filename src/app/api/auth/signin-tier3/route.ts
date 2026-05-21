/**
 * DEPRECATED — kept as a backwards-compat alias for /api/auth/signin.
 * Identical behavior. New code should call /api/auth/signin directly.
 */

import { POST as signinPost } from '../signin/route'

export const POST = signinPost
