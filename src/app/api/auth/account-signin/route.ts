/**
 * DEPRECATED — account-signin was an interim route for the bespoke accounts
 * table. Gone with the Supabase Auth unification (2026-05-20).
 */

import { POST as signinPost } from '../signin/route'

export const POST = signinPost
