/**
 * Supabase server clients. Two flavors:
 *
 *  - createServerSupabase(): per-request SSR client wired to Next.js cookies.
 *    Reads/writes the `sb-*` auth cookies. Use from server components,
 *    route handlers, and server actions. Refreshes the session on its own.
 *
 *  - createAdminSupabase(): service-role client, no cookies. Use ONLY for
 *    privileged operations that bypass RLS (admin user create, signups, etc).
 *
 * Pattern: `@supabase/ssr` + `next/headers` cookies(). Next 16 requires
 * `await cookies()` and `cookieStore.set()` may throw from server components
 * (only mutates from route handlers / server actions), so we swallow that.
 */

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a server component where cookies are read-only.
            // Safe to ignore — the middleware (or a subsequent route handler)
            // will write the refreshed token cookie.
          }
        },
      },
    }
  )
}

export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
