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

type Mode = 'signin' | 'create' | 'password'

export interface AuthFormProfile {
  id: string
  first_name: string
  manager_name: string
  display_name: string | null
  is_owner: boolean
}

interface AuthFormProps {
  /** Called when the user is fully authed (account + profile). */
  onAuth: (profile: AuthFormProfile) => void
  /** Called after a Tier 3 password login when a profile picker is needed. */
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
  const [managerName, setManagerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError('')
    if (mode === 'signin') {
      if (!email.trim() || !firstName.trim() || pin.length !== 4) {
        setError('Email, first name, and a 4-digit PIN are required.')
        return
      }
      setLoading(true)
      const res = await fetch('/api/auth/signin-tier1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), first_name: firstName.trim(), pin }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok || !data.profile) {
        setError(data.error ?? 'Sign-in failed.')
        return
      }
      persistLegacy(data.profile)
      onAuth(data.profile)
      return
    }

    if (mode === 'create') {
      if (!email.trim() || !firstName.trim() || !managerName.trim() || pin.length !== 4) {
        setError('Email, first name, team (manager) name, and 4-digit PIN are required.')
        return
      }
      setLoading(true)
      const res = await fetch('/api/auth/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          first_name: firstName.trim(),
          pin,
          manager_name: managerName.trim(),
        }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok || !data.profile) {
        if (data.code === 'ACCOUNT_EXISTS') {
          setError('This email already has an account. Switch to "Sign in" and use your PIN.')
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

    if (mode === 'password') {
      if (!email.trim() || !password) {
        setError('Email and password required.')
        return
      }
      setLoading(true)
      const res = await fetch('/api/auth/signin-tier3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok) {
        if (data.code === 'PASSWORD_PENDING') {
          setError(
            'Password not set yet. Use "Sign in" with your first name + PIN, then add a password in Account Settings.'
          )
          setMode('signin')
          return
        }
        setError(data.error ?? 'Login failed.')
        return
      }
      const profiles = (data.profiles ?? []) as AuthFormProfile[]
      if (onProfilePickerNeeded) {
        onProfilePickerNeeded(profiles)
        return
      }
      // Fallback: pick the first profile automatically (e.g. when used outside a flow with a picker)
      if (profiles.length === 1) {
        const pickRes = await fetch('/api/auth/pick-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: profiles[0].id }),
        })
        const pickData = await pickRes.json()
        if (pickRes.ok && pickData.profile) {
          persistLegacy(pickData.profile)
          onAuth(pickData.profile)
          return
        }
      }
      setError('Signed in — choose a profile to continue.')
      return
    }
  }

  // Keep the legacy localStorage keys in sync so the existing bracket page
  // (which still reads them) doesn't immediately log the user out.
  function persistLegacy(profile: AuthFormProfile) {
    try {
      localStorage.setItem('bracket_user_id', profile.id)
      localStorage.setItem('bracket_display_name', profile.display_name || profile.manager_name || profile.first_name)
    } catch {}
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
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingTop: isModal ? 0 : '1rem' }}>
          <img
            src="/total90-logo-green.png"
            alt=""
            style={{ width: '56px', height: '56px', objectFit: 'contain', display: 'block', margin: '0 auto 0.75rem' }}
          />
          <h1 style={{ color: C.gold, fontWeight: 900, fontSize: '1.5rem', margin: '0 0 0.25rem' }}>
            Bracket Challenge
          </h1>
          <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>World Cup 2026 · Pick your winners</p>
        </div>

        {mode !== 'password' && (
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: '1.5rem' }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setMode(t.id); setError('') }}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  borderBottom: mode === t.id ? `2px solid ${C.gold}` : '2px solid transparent',
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

        {mode === 'password' && (
          <p style={{ color: C.muted, fontSize: '0.85rem', textAlign: 'center', margin: '0 0 1rem' }}>
            Parent sign-in (email + password)
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
              Email
            </label>
            <input
              style={inp}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {mode !== 'password' && (
            <div>
              <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
                First Name
              </label>
              <input
                style={inp}
                placeholder="Your first name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </div>
          )}

          {mode === 'create' && (
            <div>
              <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
                Team / Manager Name
              </label>
              <input
                style={inp}
                placeholder="e.g. Rapaziada FC"
                value={managerName}
                onChange={e => setManagerName(e.target.value)}
              />
              <p style={{ color: '#4A6080', fontSize: '0.72rem', margin: '0.35rem 0 0' }}>
                Shows on the leaderboard.
              </p>
            </div>
          )}

          {mode !== 'password' && (
            <div>
              <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
                4-Digit PIN
              </label>
              <input
                style={{ ...inp, letterSpacing: '0.3em', textAlign: 'center' as const }}
                type="password"
                inputMode="numeric"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              />
            </div>
          )}

          {mode === 'password' && (
            <div>
              <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
                Account Password
              </label>
              <input
                style={inp}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: 0 }}>{error}</p>}

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
                  : 'Sign In →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
            {mode !== 'password' ? (
              <button
                type="button"
                onClick={() => { setMode('password'); setError('') }}
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
                Parent? Use email + password instead
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMode('signin'); setError('') }}
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
                ← Back to PIN sign-in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
