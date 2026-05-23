'use client'

/**
 * Self-hydrating auth header bar used across every WC26 tab
 * (bracket / predictor / news / s3 / scores).
 *
 * Hydration: GET /api/auth/me on mount (no-store).
 * Authed dropdown contains:
 *   - List of sibling profiles on the same account (click to switch)
 *   - "+ Add a profile" inline form (first_name + manager_name + PIN)
 *   - Sign out
 */

import { useCallback, useEffect, useState } from 'react'
import AuthModal from './AuthModal'

const C = {
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  text: '#F0F4FF',
  muted: '#8899CC',
  red: '#F87171',
}

interface MeResponse {
  account: { id: string; email: string } | null
  profile: {
    id: string
    first_name: string
    manager_name: string
    display_name: string | null
    is_owner: boolean
  } | null
}

interface SiblingProfile {
  id: string
  first_name: string
  manager_name: string
  display_name: string | null
  is_owner: boolean
}

export default function AuthHeader() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [siblings, setSiblings] = useState<SiblingProfile[] | null>(null)
  const [siblingsLoading, setSiblingsLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addFirstName, setAddFirstName] = useState('')
  const [addManager, setAddManager] = useState('')
  const [addError, setAddError] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      const data = await res.json()
      setMe(data)
    } catch {
      setMe({ account: null, profile: null })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Lazy-load sibling profiles only when the menu opens for the first time.
  useEffect(() => {
    if (!menuOpen || !me?.account || siblings || siblingsLoading) return
    setSiblingsLoading(true)
    fetch('/api/auth/profiles', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then((d: { profiles?: SiblingProfile[] }) => setSiblings(d.profiles ?? []))
      .catch(() => setSiblings([]))
      .finally(() => setSiblingsLoading(false))
  }, [menuOpen, me?.account, siblings, siblingsLoading])

  const handleAuth = async () => {
    // After sign-in, wait until the auth cookie is actually visible to the
    // server (poll /api/auth/me) before doing a hard reload. Skipping this
    // step caused a race where reload() fired before the browser committed
    // the Set-Cookie header, leaving the next page render anonymous and
    // forcing the user to refresh again.
    if (typeof window === 'undefined') {
      refresh()
      return
    }
    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (data?.profile) break
      } catch { /* keep trying */ }
      await new Promise((r) => setTimeout(r, 100))
    }
    window.location.reload()
  }

  const handleSignOut = async () => {
    setMenuOpen(false)
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
    try {
      localStorage.removeItem('bracket_user_id')
      localStorage.removeItem('bracket_display_name')
      // Clear cached picks/leaderboard so the next user doesn't see stale data.
      const keysToClear: string[] = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i)
        if (k && (k.startsWith('predictor.') || k.startsWith('bracket.'))) keysToClear.push(k)
      }
      for (const k of keysToClear) window.sessionStorage.removeItem(k)
    } catch {}
    setMe({ account: null, profile: null })
    setSiblings(null)
    // Force a reload so per-page auth state (bracket userId, predictor probes) resets cleanly.
    if (typeof window !== 'undefined') window.location.reload()
  }

  const switchProfile = async (profile_id: string) => {
    if (profile_id === me?.profile?.id) {
      setMenuOpen(false)
      return
    }
    const res = await fetch('/api/auth/pick-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ profile_id }),
    })
    if (!res.ok) return
    // Hard reload so every tab (bracket, predictor, etc.) re-reads the new profile session.
    if (typeof window !== 'undefined') window.location.reload()
  }

  const submitAdd = async () => {
    setAddError('')
    if (!addFirstName.trim() || !addManager.trim()) {
      setAddError('First name and team name are required.')
      return
    }
    setAddBusy(true)
    try {
      const res = await fetch('/api/auth/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          first_name: addFirstName.trim(),
          manager_name: addManager.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error ?? 'Could not create profile.')
        setAddBusy(false)
        return
      }
      // Append to local list, reset form, close add panel.
      setSiblings(prev => prev ? [...prev, data.profile] : [data.profile])
      setAddFirstName('')
      setAddManager('')
      setAddOpen(false)
      setAddBusy(false)
    } catch {
      setAddError('Network error. Try again.')
      setAddBusy(false)
    }
  }

  const displayName =
    me?.profile?.display_name || me?.profile?.manager_name || me?.profile?.first_name || ''

  // Close menu when clicking outside.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('[data-authheader-menu]')) return
      setMenuOpen(false)
      setAddOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  return (
    <>
      <div
        style={{
          backgroundColor: C.card,
          borderBottom: `1px solid ${C.border}`,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <a
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              textDecoration: 'none',
            }}
          >
            <img
              src="/total90-logo-green.png"
              alt="Total90"
              style={{ width: 32, height: 32, objectFit: 'contain' }}
            />
            <span style={{ color: C.gold, fontWeight: 700, fontSize: '1rem' }}>
              World Cup 2026
            </span>
          </a>
          <div style={{ position: 'relative' }} data-authheader-menu>
            {me?.profile ? (
              <>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: '0.5rem',
                    color: C.text,
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    padding: '0.45rem 0.85rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {displayName} ▾
                </button>
                {menuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '110%',
                      right: 0,
                      backgroundColor: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: '0.625rem',
                      padding: '0.4rem',
                      minWidth: 260,
                      zIndex: 100,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                  >
                    {/* Profile list */}
                    <div style={{ padding: '0.35rem 0.55rem 0.25rem', color: C.muted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Profiles on this account
                    </div>
                    {siblingsLoading && !siblings && (
                      <div style={{ padding: '0.5rem 0.55rem', color: C.muted, fontSize: '0.82rem' }}>Loading…</div>
                    )}
                    {siblings?.map(p => {
                      const active = p.id === me.profile?.id
                      return (
                        <button
                          key={p.id}
                          onClick={() => switchProfile(p.id)}
                          style={{
                            background: active ? C.borderSoft : 'none',
                            border: 'none',
                            color: C.text,
                            fontSize: '0.85rem',
                            padding: '0.55rem 0.6rem',
                            width: '100%',
                            textAlign: 'left',
                            cursor: active ? 'default' : 'pointer',
                            borderRadius: '0.4rem',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                          }}
                          disabled={active}
                        >
                          <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                            <span style={{ fontWeight: 700 }}>{p.manager_name}</span>
                            <span style={{ color: C.muted, fontSize: '0.72rem' }}>
                              {p.display_name || p.first_name}{p.is_owner ? ' · Owner' : ''}
                            </span>
                          </span>
                          {active && <span style={{ color: C.green, fontSize: '0.72rem', fontWeight: 700 }}>•</span>}
                        </button>
                      )
                    })}

                    {/* Add profile */}
                    {!addOpen ? (
                      <button
                        onClick={() => setAddOpen(true)}
                        style={{
                          background: 'none',
                          border: `1px dashed ${C.border}`,
                          color: C.gold,
                          fontSize: '0.82rem',
                          padding: '0.5rem 0.6rem',
                          width: '100%',
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderRadius: '0.4rem',
                          fontFamily: 'inherit',
                          marginTop: '0.25rem',
                          fontWeight: 700,
                        }}
                      >
                        + Add a profile
                      </button>
                    ) : (
                      <div
                        style={{
                          border: `1px solid ${C.border}`,
                          borderRadius: '0.5rem',
                          padding: '0.55rem',
                          marginTop: '0.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                        }}
                      >
                        <input
                          autoFocus
                          placeholder="First name (e.g. Lucas)"
                          value={addFirstName}
                          onChange={e => setAddFirstName(e.target.value)}
                          style={inp}
                        />
                        <input
                          placeholder="Team name (e.g. Lucas's Lions)"
                          value={addManager}
                          onChange={e => setAddManager(e.target.value)}
                          style={inp}
                        />
                        {addError && (
                          <p style={{ color: C.red, fontSize: '0.74rem', margin: 0 }}>{addError}</p>
                        )}
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={submitAdd}
                            disabled={addBusy}
                            style={{
                              flex: 1,
                              backgroundColor: addBusy ? C.borderSoft : C.gold,
                              color: '#0A0F2E',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              padding: '0.5rem',
                              borderRadius: '0.4rem',
                              border: 'none',
                              cursor: addBusy ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {addBusy ? 'Adding…' : 'Add profile'}
                          </button>
                          <button
                            onClick={() => { setAddOpen(false); setAddError('') }}
                            style={{
                              backgroundColor: 'transparent',
                              color: C.muted,
                              border: `1px solid ${C.border}`,
                              borderRadius: '0.4rem',
                              padding: '0.5rem 0.7rem',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ height: 1, background: C.border, margin: '0.5rem 0.2rem' }} />

                    <button
                      onClick={handleSignOut}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.muted,
                        fontSize: '0.82rem',
                        padding: '0.5rem 0.6rem',
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '0.4rem',
                        fontFamily: 'inherit',
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                style={{
                  backgroundColor: C.gold,
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#0A0F2E',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>

      <AuthModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onAuth={handleAuth} />
    </>
  )
}

const inp: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#162040',
  border: '1px solid #1E3A6E',
  borderRadius: '0.45rem',
  padding: '0.5rem 0.6rem',
  color: '#F0F4FF',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}
