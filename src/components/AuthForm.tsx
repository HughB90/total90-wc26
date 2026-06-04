'use client'

import { useState } from 'react'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  text: '#F0F4FF',
  muted: '#8899CC',
}

type Mode = 'signin' | 'create' | 'reset' | 'setup-profile'

export interface AuthFormProfile {
  id: string
  first_name: string
  last_name?: string | null
  manager_name: string
  display_name: string | null
  is_owner: boolean
}

interface AuthFormProps {
  /** Called when the user is fully authed (account + profile). */
  onAuth: (profile: AuthFormProfile) => void
  /** Called after a sign-in when more than one profile exists. */
  onProfilePickerNeeded?: (profiles: AuthFormProfile[]) => void
  isModal?: boolean
  defaultMode?: Mode
}

export default function AuthForm({
  onAuth,
  onProfilePickerNeeded,
  isModal = false,
  defaultMode = 'signin',
}: AuthFormProps) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  function persistLegacy(profile: AuthFormProfile) {
    try {
      localStorage.setItem('bracket_user_id', profile.id)
      localStorage.setItem(
        'bracket_display_name',
        profile.display_name || profile.manager_name || profile.first_name
      )
    } catch {}
  }

  async function handleSubmit() {
    setError('')
    setInfo('')

    if (mode === 'signin') {
      if (!email.trim() || !password) {
        setError('Email and password are required.')
        return
      }
      setLoading(true)
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok) {
        setError(data.error ?? 'Sign-in failed.')
        return
      }
      // Server auto-picks if there's only one profile.
      if (data.profile) {
        persistLegacy(data.profile)
        onAuth(data.profile)
        return
      }
      const profiles = (data.profiles ?? []) as AuthFormProfile[]
      if (profiles.length === 0) {
        // Authed Supabase user with no wc26 profile yet (e.g. existing sessions
        // user signing into wc26 for the first time). Pivot the form into
        // "create your first bracket profile" mode — user is already authed,
        // we just need first_name + manager_name to POST /api/auth/profiles.
        setInfo('Welcome! Set up your bracket profile to get started.')
        setMode('setup-profile')
        return
      }
      if (onProfilePickerNeeded) {
        onProfilePickerNeeded(profiles)
      } else {
        // No picker callback — pick the first one.
        const pickRes = await fetch('/api/auth/pick-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: profiles[0].id }),
        })
        const pickData = await pickRes.json()
        if (pickRes.ok && pickData.profile) {
          persistLegacy(pickData.profile)
          onAuth(pickData.profile)
        } else {
          setError(pickData.error ?? 'Could not pick profile.')
        }
      }
      return
    }

    if (mode === 'create') {
      if (
        !email.trim() ||
        !password ||
        !firstName.trim() ||
        !lastName.trim() ||
        !managerName.trim()
      ) {
        setError(
          'Email, password, first name, last name, and team name are required.'
        )
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      setLoading(true)
      const res = await fetch('/api/auth/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          manager_name: managerName.trim(),
        }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok || !data.profile) {
        if (data.code === 'ACCOUNT_EXISTS') {
          setError('That email already has an account. Sign in instead.')
          setMode('signin')
          return
        }
        setError(data.error ?? 'Account creation failed.')
        return
      }
      persistLegacy(data.profile)
      onAuth(data.profile)
      return
    }

    if (mode === 'setup-profile') {
      if (!firstName.trim() || !lastName.trim() || !managerName.trim()) {
        setError('First name, last name, and team name are required.')
        return
      }
      setLoading(true)
      // No PIN required for the owner profile — PIN is for kid sub-profiles only.
      // The server-side route uses a randomly-generated PIN when not supplied.
      const res = await fetch('/api/auth/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          manager_name: managerName.trim(),
          is_owner: true,
        }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok || !data.profile) {
        setError(data.error ?? 'Could not create profile.')
        return
      }
      // Now pick it so the profile cookie is set, then complete auth.
      const pickRes = await fetch('/api/auth/pick-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ profile_id: data.profile.id }),
      })
      const pickData = await pickRes.json()
      if (pickRes.ok && pickData.profile) {
        persistLegacy(pickData.profile)
        onAuth(pickData.profile)
      } else {
        setError(pickData.error ?? 'Profile created but could not be selected.')
      }
      return
    }

    if (mode === 'reset') {
      if (!email.trim()) {
        setError('Enter your email to receive a reset link.')
        return
      }
      setLoading(true)
      await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      setLoading(false)
      // Always report success to avoid leaking whether the email exists.
      setInfo(
        'If that email is registered, a reset link is on its way. Check your inbox.'
      )
      return
    }
  }

  const inp: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#162040',
    border: '1px solid #1E3A6E',
    borderRadius: '0.625rem',
    padding: '0.7rem 1rem',
    color: '#F0F4FF',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const containerStyle: React.CSSProperties = isModal
    ? { width: '100%', maxWidth: '380px' }
    : { minHeight: '100vh', backgroundColor: C.bg, padding: '1.5rem 1.5rem 6rem' }

  const innerStyle: React.CSSProperties = isModal
    ? { width: '100%' }
    : { width: '100%', maxWidth: '380px', margin: '0 auto' }

  const tabs: { id: Mode; label: string }[] = [
    { id: 'signin', label: 'Sign In' },
    { id: 'create', label: 'Create Account' },
  ]

  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        <div
          style={{
            textAlign: 'center',
            marginBottom: '1.5rem',
            paddingTop: isModal ? 0 : '1rem',
          }}
        >
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
            Bracket Challenge
          </h1>
          <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
            World Cup 2026 · Pick your winners
          </p>
          <p style={{ color: '#8899CC', fontSize: '0.72rem', margin: '0.5rem 0 0', fontStyle: 'italic' }}>
            Tip: one account can hold multiple profiles — add kids and family members from your profile menu after sign-in.
          </p>
        </div>

        {mode !== 'reset' && mode !== 'setup-profile' && (
          <div
            style={{
              display: 'flex',
              borderBottom: `1px solid ${C.border}`,
              marginBottom: '1.5rem',
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setMode(t.id)
                  setError('')
                  setInfo('')
                }}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  borderBottom:
                    mode === t.id ? `2px solid ${C.gold}` : '2px solid transparent',
                  color: mode === t.id ? C.gold : C.muted,
                  fontWeight: mode === t.id ? 700 : 400,
                  fontSize: '0.875rem',
                  padding: '0.6rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {mode === 'reset' && (
          <p
            style={{
              color: C.muted,
              fontSize: '0.85rem',
              textAlign: 'center',
              margin: '0 0 1rem',
            }}
          >
            Enter your email — we&apos;ll send you a reset link.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {mode !== 'setup-profile' && (
            <div>
              <label
                style={{
                  color: C.muted,
                  fontSize: '0.78rem',
                  display: 'block',
                  marginBottom: '0.4rem',
                }}
              >
                Email
              </label>
              <input
                style={inp}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          {(mode === 'create' || mode === 'setup-profile') && (
            <>
              <div>
                <label
                  style={{
                    color: C.muted,
                    fontSize: '0.78rem',
                    display: 'block',
                    marginBottom: '0.4rem',
                  }}
                >
                  First Name
                </label>
                <input
                  style={inp}
                  placeholder="Your first name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <label
                  style={{
                    color: C.muted,
                    fontSize: '0.78rem',
                    display: 'block',
                    marginBottom: '0.4rem',
                  }}
                >
                  Last Name
                </label>
                <input
                  style={inp}
                  placeholder="Your last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div>
                <label
                  style={{
                    color: C.muted,
                    fontSize: '0.78rem',
                    display: 'block',
                    marginBottom: '0.4rem',
                  }}
                >
                  Team / Manager Name
                </label>
                <input
                  style={inp}
                  placeholder="e.g. Rapaziada FC"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                />
                <p
                  style={{
                    color: '#4A6080',
                    fontSize: '0.72rem',
                    margin: '0.35rem 0 0',
                  }}
                >
                  Shows on the leaderboard.
                </p>
              </div>
            </>
          )}

          {mode !== 'reset' && mode !== 'setup-profile' && (
            <div>
              <label
                style={{
                  color: C.muted,
                  fontSize: '0.78rem',
                  display: 'block',
                  marginBottom: '0.4rem',
                }}
              >
                Password
              </label>
              <input
                style={inp}
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'create' && (
                <p
                  style={{
                    color: '#4A6080',
                    fontSize: '0.72rem',
                    margin: '0.35rem 0 0',
                  }}
                >
                  8+ characters.
                </p>
              )}
            </div>
          )}

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: 0 }}>
              {error}
            </p>
          )}
          {info && (
            <p style={{ color: '#34d399', fontSize: '0.82rem', margin: 0 }}>
              {info}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: loading ? '#162040' : C.gold,
              color: '#0A0F2E',
              fontWeight: 800,
              fontSize: '1rem',
              padding: '0.875rem',
              borderRadius: '0.875rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading
              ? 'Loading…'
              : mode === 'signin'
                ? 'Sign In →'
                : mode === 'create'
                  ? 'Create Account →'
                  : mode === 'setup-profile'
                    ? 'Create Bracket Profile →'
                    : 'Send Reset Link →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => {
                  setMode('reset')
                  setError('')
                  setInfo('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: C.muted,
                  fontSize: '0.78rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Forgot password?
              </button>
            )}
            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => {
                  setMode('signin')
                  setError('')
                  setInfo('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: C.muted,
                  fontSize: '0.78rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ← Back to sign-in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
