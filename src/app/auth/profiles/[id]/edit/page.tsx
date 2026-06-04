/**
 * /auth/profiles/[id]/edit — Owner edits a profile (own or kid).
 *
 * Server component: resolves the session, verifies the caller is the owner
 * of the same account as the target profile, looks up the Round 1 lock
 * state, then delegates to the client form. After R1 lock, first_name and
 * last_name are read-only; manager_name remains editable.
 */

import { redirect, notFound } from 'next/navigation'
import { resolveSession } from '@/lib/auth-session-server'
import { createAdminSupabase } from '@/lib/supabase-server'
import { isProfileNameLocked } from '@/lib/predictor/round-lock'
import EditProfileForm from './EditProfileForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditProfilePage({ params }: PageProps) {
  const { id } = await params
  const { account, profile: callerProfile } = await resolveSession()

  if (!account) {
    redirect(`/auth?next=/auth/profiles/${id}/edit`)
  }

  // Only the owner of the account can reach this surface.
  if (!callerProfile || !callerProfile.is_owner) {
    redirect('/auth/picker')
  }

  const admin = createAdminSupabase()
  const { data: target } = await admin
    .from('profiles')
    .select('id, account_id, first_name, last_name, manager_name, display_name, is_owner')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!target || target.account_id !== account.id) {
    notFound()
  }

  const nameLocked = await isProfileNameLocked()

  return (
    <EditProfileForm
      profileId={target.id}
      initialFirstName={target.first_name ?? ''}
      initialLastName={target.last_name ?? ''}
      initialManagerName={target.manager_name ?? ''}
      isOwnerTarget={target.is_owner}
      nameLocked={nameLocked}
    />
  )
}
