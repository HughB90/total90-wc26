'use client'

/**
 * /auth/reset-password — completes a Supabase Auth password recovery.
 *
 * Two ways a user can land here with a valid recovery session:
 *
 *  1. Legacy hash-fragment flow (current default for this project): the URL
 *     contains `#access_token=...&refresh_token=...&type=recovery`. We parse
 *     it ourselves and call `setSession({ access_token, refresh_token })`
 *     because @supabase/ssr's createBrowserClient (cookie storage) does NOT
 *     auto-detect tokens in window.location.hash the way vanilla
 *     @supabase/supabase-js does.
 *
 *  2. PKCE flow (if Supabase migrates this project later): /auth/callback
 *     exchanges the `?code=` server-side and the `sb-*` cookies are already
 *     live by the time we land here. getSession() returns the session.
 *
 * Either way we then call `updateUser({ password })` and redirect to /bracket.
 *
 * Styled to match the Bracket Challenge AuthForm modal — same palette,
 * same inputs, same gold CTA button.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  text: '#F0F4FF',
  muted: '#8899CC',
  inputBg: '#162040',
  errBg: 'rgba(239, 68, 68, 0.12)',
  errBorder: 'rgba(239, 68, 68, 0.45)',
  errText: '#fca5a5',
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    let cancelled = false

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasSession(true)
        setReady(true)
      }
    })

    async function bootstrap() {
      // 1. Already have a session?
      const existing = await supabase.auth.getSession()
      if (cancelled) return
      if (existing.data.session) {
        setHasSession(true)
        setReady(true)
        return
      }

      // 2. Try to recover from the URL hash fragment.
      if (typeof window !== 'undefined' && window.location.hash.length > 1) {
        const params = new URLSearchParams(window.location.hash.slice(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        const type = params.get('type')
        const hashErr = params.get('error_description') || params.get('error')

        if (hashErr) {
          setReady(true)
          return
        }
        if (access_token && refresh_token && type === 'recovery') {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (cancelled) return
          if (!setErr) {
            setHasSession(true)
            try {
              window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search
              )
            } catch {
              /* non-fatal */
            }
          }
          setReady(true)
          return
        }
      }

      // 3. No session, no recoverable hash — link is invalid/expired.
      setReady(true)
    }
    void bootstrap()

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords don’t match.')
      return
    }
    setLoading(true)
    const { error: upErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    router.replace('/bracket')
    router.refresh()
  }

  const inp: React.CSSProperties = {
    width: '100%',
    backgroundColor: C.inputBg,
    border: `1px solid ${C.border}`,
    borderRadius: '0.625rem',
    padding: '0.7rem 1rem',
    color: C.text,
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    color: C.muted,
    fontSize: '0.78rem',
    display: 'block',
    marginBottom: '0.4rem',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '2.5rem 1.25rem 4rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div
          style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '1rem',
            padding: '1.75rem 1.5rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <img
              src="/total90-logo-green.png"
              alt=""
              style={{
                width: '56px',
                height: '56px',
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto 0.75rem',
              }}
            />
            <h1
              style={{
                color: C.gold,
                fontWeight: 900,
                fontSize: '1.5rem',
                margin: '0 0 0.25rem',
              }}
            >
              Set a New Password
            </h1>
            <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
              Choose a new password for your World Cup account.
            </p>
          </div>

          {!ready ? (
            <p
              style={{
                color: C.muted,
                fontSize: '0.85rem',
                textAlign: 'center',
                margin: '0.5rem 0',
              }}
            >
              Verifying recovery link…
            </p>
          ) : !hasSession ? (
            <div
              style={{
                backgroundColor: C.errBg,
                border: `1px solid ${C.errBorder}`,
                borderRadius: '0.625rem',
                padding: '0.875rem 1rem',
                color: C.errText,
                fontSize: '0.85rem',
                lineHeight: 1.45,
              }}
            >
              This reset link is invalid or has expired. Request a new one from
              the{' '}
              <a
                href="/bracket"
                style={{ color: C.gold, textDecoration: 'underline' }}
              >
                bracket page
              </a>{' '}
              by clicking <em>Forgot password?</em> on the sign-in modal.
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label style={labelStyle}>New password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={inp}
                  placeholder="••••••••"
                />
                <p
                  style={{
                    color: '#4A6080',
                    fontSize: '0.72rem',
                    margin: '0.35rem 0 0',
                  }}
                >
                  8+ characters.
                </p>
              </div>
              <div>
                <label style={labelStyle}>Confirm new password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  style={inp}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: 0 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  backgroundColor: loading ? C.inputBg : C.gold,
                  color: '#0A0F2E',
                  fontWeight: 800,
                  fontSize: '1rem',
                  padding: '0.875rem',
                  borderRadius: '0.875rem',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  marginTop: '0.25rem',
                }}
              >
                {loading ? 'Saving…' : 'Update Password →'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
                <a
                  href="/bracket"
                  style={{
                    color: C.muted,
                    fontSize: '0.78rem',
                    textDecoration: 'underline',
                    fontFamily: 'inherit',
                  }}
                >
                  ← Back to bracket
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
