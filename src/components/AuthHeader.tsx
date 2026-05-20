'use client'

/**
 * Self-hydrating auth header bar for pages that don't manage auth state
 * themselves (s3 / scores / news / predictor). Calls /api/auth/me on mount,
 * shows "Sign in" when anon, profile dropdown when authed.
 */

import { useCallback, useEffect, useState } from 'react'
import AuthModal from './AuthModal'

const C = {
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  text: '#F0F4FF',
  muted: '#8899CC',
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

export default function AuthHeader() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  const handleAuth = () => {
    refresh()
  }

  const handleSignOut = async () => {
    setMenuOpen(false)
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
    try {
      localStorage.removeItem('bracket_user_id')
      localStorage.removeItem('bracket_display_name')
    } catch {}
    setMe({ account: null, profile: null })
  }

  const displayName =
    me?.profile?.display_name || me?.profile?.manager_name || me?.profile?.first_name || ''

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
            href="/bracket"
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
          <div style={{ position: 'relative' }}>
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
                      padding: '0.5rem',
                      minWidth: 160,
                      zIndex: 100,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                  >
                    <button
                      onClick={handleSignOut}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.text,
                        fontSize: '0.85rem',
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
