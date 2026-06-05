'use client'

/**
 * /auth/picker — "Who's playing?" Netflix-style profile picker.
 *
 * Owner-only affordances (added 2026-06-04):
 *   - "Edit" pencil on every profile in the account.
 *   - "Delete" trash on every non-owner profile.
 *   - Delete is hidden once Round 1 has started (the server hard-blocks it
 *     anyway with a 409, but we suppress the affordance to avoid confusion).
 */

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

export default function ProfilePickerPage() {
  return (
    <Suspense fallback={null}>
      <ProfilePickerInner />
    </Suspense>
  )
}

interface Profile {
  id: string
  first_name: string
  last_name?: string | null
  manager_name: string
  display_name: string | null
  is_owner: boolean
}

function ProfilePickerInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [callerIsOwner, setCallerIsOwner] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const loadProfiles = useCallback(async () => {
    try {
      const [profilesRes, meRes] = await Promise.all([
        fetch('/api/auth/profiles'),
        fetch('/api/auth/me'),
      ])
      const profilesData = await profilesRes.json()
      const meData = await meRes.json()

      if (!profilesRes.ok) {
        setError(profilesData.error || 'Failed to load profiles')
        return
      }

      setProfiles(profilesData.profiles || [])
      // The caller is considered "the owner" if their active profile is the
      // owner. Kids signed-in as their own profile can't manage the picker.
      setCallerIsOwner(Boolean(meData?.profile?.is_owner))
    } catch (err) {
      setError('Network error. Please try again.')
      console.error('Error fetching profiles:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  const selectProfile = async (firstName: string) => {
    const pin = prompt(`Enter ${firstName}'s 4-digit PIN:`)

    if (!pin || pin.length !== 4) {
      alert('PIN must be exactly 4 digits')
      return
    }

    try {
      const res = await fetch('/api/auth/quick-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName, pin }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'Incorrect PIN')
        return
      }

      router.push(next)
      router.refresh()
    } catch (err) {
      alert('Network error. Please try again.')
      console.error('Profile selection error:', err)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/auth/profiles/${confirmDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error ?? 'Could not delete profile.')
        return
      }
      setConfirmDelete(null)
      await loadProfiles()
    } catch (err) {
      console.error(err)
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">Loading profiles...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center p-4">
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-red-200 max-w-md">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold text-white mb-8">Who&apos;s playing?</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-4xl">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="group relative bg-gradient-to-br from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/40 hover:to-teal-500/40 border border-white/20 rounded-xl p-6 transition-all"
          >
            <button
              onClick={() => selectProfile(profile.first_name)}
              className="w-full text-left"
            >
              <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-3xl font-bold">
                {profile.first_name[0].toUpperCase()}
              </div>

              <div className="text-white font-semibold text-lg text-center">
                {profile.display_name || profile.first_name}
              </div>

              <div className="text-emerald-300 text-sm text-center mt-1">
                {profile.manager_name}
              </div>

              {profile.is_owner && (
                <div className="absolute top-2 right-2 bg-yellow-500 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                  OWNER
                </div>
              )}
            </button>

            {callerIsOwner && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <a
                  href={`/auth/profiles/${profile.id}/edit`}
                  className="text-xs text-white/70 hover:text-white underline"
                  aria-label={`Edit ${profile.first_name}`}
                >
                  Edit
                </a>
                {!profile.is_owner && (
                  <>
                    <span className="text-white/30">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError('')
                        setConfirmDelete(profile)
                      }}
                      className="text-xs text-red-300 hover:text-red-200 underline"
                      aria-label={`Delete ${profile.first_name}`}
                    >
                      🗑 Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        <a
          href="/auth/profiles/new"
          className="group relative bg-white/5 hover:bg-white/10 border border-dashed border-white/30 rounded-xl p-6 transition-all hover:scale-105 flex flex-col items-center justify-center"
        >
          <div className="w-20 h-20 mb-3 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white text-4xl">
            +
          </div>
          <div className="text-white/70 font-semibold text-center">Add Profile</div>
        </a>
      </div>

      <button
        onClick={async () => {
          await fetch('/api/auth/signout', { method: 'POST' })
          router.push('/')
          router.refresh()
        }}
        className="mt-8 text-white/50 hover:text-white/80 text-sm underline"
      >
        Sign out
      </button>

      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 15, 46, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '380px',
              background: '#0F1C4D',
              border: '1px solid #1E3A6E',
              borderRadius: '0.875rem',
              padding: '1.5rem',
              color: '#F0F4FF',
              fontFamily: 'inherit',
            }}
          >
            <h2
              style={{
                color: '#FBBF24',
                fontSize: '1.1rem',
                fontWeight: 800,
                margin: '0 0 0.5rem',
              }}
            >
              Delete profile?
            </h2>
            <p style={{ color: '#8899CC', fontSize: '0.9rem', margin: '0 0 1rem' }}>
              This will permanently remove{' '}
              <strong style={{ color: '#F0F4FF' }}>
                {confirmDelete.display_name || confirmDelete.first_name}
              </strong>{' '}
              and any picks they&apos;ve made. This can&apos;t be undone.
            </p>

            {deleteError && (
              <p
                style={{
                  color: '#ef4444',
                  fontSize: '0.82rem',
                  margin: '0 0 1rem',
                }}
              >
                {deleteError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #1E3A6E',
                  color: '#8899CC',
                  padding: '0.7rem',
                  borderRadius: '0.625rem',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  background: deleting ? '#162040' : '#ef4444',
                  border: 'none',
                  color: '#fff',
                  padding: '0.7rem',
                  borderRadius: '0.625rem',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
