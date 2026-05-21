/**
 * /auth/account-signin — DEPRECATED. Redirects to /auth/signin.
 *
 * Used to be the Tier 3 email + password entry point. Post 2026-05-20 Supabase
 * Auth unification, /auth/signin IS the email + password page (and the only
 * one), so this is a redirect.
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<{ next?: string }>
}

export default async function AccountSignInPage({ searchParams }: PageProps) {
  const params = await searchParams
  const next = params?.next
  redirect(next ? `/auth/signin?next=${encodeURIComponent(next)}` : '/auth/signin')
}
