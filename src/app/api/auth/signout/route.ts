/**
 * POST /api/auth/signout — Clear both account and profile sessions
 * 
 * Feature flag: MULTI_PROFILE_ENABLED
 */

import { NextRequest, NextResponse } from 'next/server'
import { clearSessions } from '@/lib/auth-cookies'

export async function POST(req: NextRequest) {
  // Feature flag check
  if (process.env.MULTI_PROFILE_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Multi-profile auth not enabled' },
      { status: 503 }
    )
  }

  try {
    await clearSessions()
    
    return NextResponse.json({
      success: true
    })

  } catch (err: any) {
    console.error('Error in /api/auth/signout:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
