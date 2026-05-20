/**
 * GET /api/auth/me — return current session (account + profile) or nulls.
 * No-auth-required; used by client header bars to hydrate state.
 */

import { NextResponse } from 'next/server'
import { resolveSession } from '@/lib/auth-session-server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  try {
    const { account, profile } = await resolveSession()
    return NextResponse.json(
      {
        account: account ? { id: account.id, email: account.email } : null,
        profile: profile
          ? {
              id: profile.id,
              account_id: profile.account_id,
              first_name: profile.first_name,
              manager_name: profile.manager_name,
              display_name: profile.display_name,
              is_owner: profile.is_owner,
            }
          : null,
      },
      { headers: NO_STORE }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { account: null, profile: null, error: message },
      { status: 500, headers: NO_STORE }
    )
  }
}
