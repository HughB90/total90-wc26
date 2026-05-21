/**
 * Next.js middleware — runs on every request to refresh the Supabase Auth
 * session cookie. Required by @supabase/ssr (otherwise the JWT goes stale and
 * server components see a logged-out user).
 *
 * The pattern is the same one Supabase recommends in their Next.js SSR guide.
 * Adapted for Next 16 (async cookies API).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // This call refreshes the session token if needed. The return value is
  // ignored — we just need the side effect (cookie rotation).
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    // Skip static, image, and well-known asset routes.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
