'use client'

/**
 * /auth/picker — "Who's playing?" Netflix-style profile picker.
 *
 * Owner-only affordances:
 *   - "Edit" link on every profile in the account.
 *   - "Delete" button on every non-owner profile (the server hard-blocks
 *     deletes after R1 lock with a 409).
 *
 * Styled with inline styles to match the rest of wc26 (AuthForm,
 * AuthHeader, reset-password). The project does not load Tailwind.
 */

import { Suspense, useState, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  text: '#F0F4FF',
  muted: '#8899CC',
  red: '#F87171',
  redBg: 'rgba(239, 68, 68, 0.12)',
  redBorder: 'rgba(239, 68, 68, 0.45)',
}

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
      <CenteredShell>
        <p style={{ color: C.muted, fontSize: '0.95rem' }}>Loading profiles…</p>
      </CenteredShell>
    )
  }

  if (error) {
    return (
      <CenteredShell>
        <div style={{
          background: C.redBg,
          border: `1px solid ${C.redBorder}`,
          borderRadius: '0.625rem',
          padding: '0.875rem 1rem',
          color: C.red,
          fontSize: '0.9rem',
          maxWidth: 380,
        }}>
          {error}
        </div>
      </CenteredShell>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '3rem 1.25rem 4rem',
    }}>
      <h1 style={{
        color: C.text,
        fontSize: '1.8rem',
        fontWeight: 900,
        margin: '0 0 0.5rem',
        textAlign: 'center',
      }}>
        Who&apos;s playing?
      </h1>
      <p style={{
        color: C.muted,
        fontSize: '0.9rem',
        margin: '0 0 2rem',
        textAlign: 'center',
        maxWidth: 380,
      }}>
        Pick a profile to continue. Enter the profile&apos;s 4-digit PIN to sign in.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '1rem',
        width: '100%',
        maxWidth: 720,
      }}>
        {profiles.map((profile) => {
          const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
          const subtitle = profile.display_name || fullName || profile.first_name
          return (
            <div
              key={profile.id}
              style={{
                position: 'relative',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: '0.875rem',
                padding: '1rem 0.85rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {profile.is_owner && (
                <span style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  background: C.gold,
                  color: '#0A0F2E',
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '0.3rem',
                  letterSpacing: '0.04em',
                }}>
                  OWNER
                </span>
              )}

              <button
                onClick={() => selectProfile(profile.first_name)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: 0,
                  fontFamily: 'inherit',
                  color: C.text,
                }}
              >
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.gold}, ${C.green})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0A0F2E',
                  fontSize: '1.8rem',
                  fontWeight: 900,
                }}>
                  {profile.first_name[0].toUpperCase()}
                </div>
                <div style={{
                  color: C.text,
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {profile.manager_name}
                </div>
                <div style={{
                  color: C.muted,
                  fontSize: '0.74rem',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {subtitle}
                </div>
              </button>

              {callerIsOwner && (
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: '0.5rem',
                  width: '100%',
                  justifyContent: 'center',
                }}>
                  <a
                    href={`/auth/profiles/${profile.id}/edit`}
                    style={{
                      color: C.muted,
                      fontSize: '0.74rem',
                      textDecoration: 'underline',
                      fontFamily: 'inherit',
                    }}
                  >
                    Edit
                  </a>
                  {!profile.is_owner && (
                    <>
                      <span style={{ color: C.border, fontSize: '0.74rem' }}>·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError('')
                          setConfirmDelete(profile)
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: C.red,
                          fontSize: '0.74rem',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0,
                          fontFamily: 'inherit',
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add Profile tile */}
        <a
          href="/auth/profiles/new"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px dashed ${C.border}`,
            borderRadius: '0.875rem',
            padding: '1rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            color: C.gold,
            textDecoration: 'none',
            minHeight: 170,
            fontFamily: 'inherit',
          }}
        >
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: `2px dashed ${C.gold}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.gold,
            fontSize: '2rem',
            fontWeight: 900,
          }}>
            +
          </div>
          <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Add Profile</div>
        </a>
      </div>

      <button
        onClick={async () => {
          await fetch('/api/auth/signout', { method: 'POST' })
          router.push('/')
          router.refresh()
        }}
        style={{
          marginTop: '2rem',
          background: 'transparent',
          border: 'none',
          color: C.muted,
          fontSize: '0.85rem',
          textDecoration: 'underline',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
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
              maxWidth: 380,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: '0.875rem',
              padding: '1.5rem',
              color: C.text,
              fontFamily: 'inherit',
            }}
          >
            <h2 style={{
              color: C.gold,
              fontSize: '1.1rem',
              fontWeight: 800,
              margin: '0 0 0.5rem',
            }}>
              Delete profile?
            </h2>
            <p style={{ color: C.muted, fontSize: '0.9rem', margin: '0 0 1rem' }}>
              This will permanently remove{' '}
              <strong style={{ color: C.text }}>
                {confirmDelete.display_name || confirmDelete.first_name}
              </strong>{' '}
              and any picks they&apos;ve made. This can&apos;t be undone.
            </p>

            {deleteError && (
              <p style={{
                color: '#ef4444',
                fontSize: '0.82rem',
                margin: '0 0 1rem',
              }}>
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
                  border: `1px solid ${C.border}`,
                  color: C.muted,
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
                  background: deleting ? C.borderSoft : '#ef4444',
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

function CenteredShell({ children }: { children: React.ReactNode }) {
  const style: CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1.25rem',
  }
  return <div style={style}>{children}</div>
}
