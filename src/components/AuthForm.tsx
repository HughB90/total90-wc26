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

interface AuthFormProps {
  onAuth: (id: string, name: string) => void
  isModal?: boolean
}

export default function AuthForm({ onAuth, isModal = false }: AuthFormProps) {
  const [tab, setTab] = useState<'signin' | 'create'>('signin')
  const [firstName, setFirstName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (tab === 'create' && (!firstName.trim() || !teamName.trim() || pin.length !== 4)) {
      setError('Fill all fields with a 4-digit PIN.')
      return
    }
    if (tab === 'signin' && (!firstName.trim() || pin.length !== 4)) {
      setError('Enter your first name and PIN.')
      return
    }
    setError('')
    setLoading(true)
    const body = tab === 'create'
      ? { action: 'create', first_name: firstName.trim(), display_name: teamName.trim(), email: email.trim() || undefined, pin }
      : { action: 'signin', first_name: firstName.trim(), pin }
    const res = await fetch('/api/bracket/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    setLoading(false)
    if (!data.ok) {
      setError(data.error ?? 'Failed.')
      return
    }
    localStorage.setItem('bracket_user_id', data.userId)
    localStorage.setItem('bracket_display_name', data.displayName)
    onAuth(data.userId, data.displayName)
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
    fontFamily: 'inherit'
  }

  const containerStyle = isModal
    ? { width: '100%', maxWidth: '380px' }
    : { minHeight: '100vh', backgroundColor: C.bg, padding: '1.5rem 1.5rem 6rem' }

  const innerStyle = isModal
    ? { width: '100%' }
    : { width: '100%', maxWidth: '380px', margin: '0 auto' }

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
          <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
            World Cup 2026 · Pick your winners
          </p>
        </div>
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: '1.5rem' }}>
          {(['signin', 'create'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                borderBottom: tab === t ? `2px solid ${C.gold}` : '2px solid transparent',
                color: tab === t ? C.gold : C.muted,
                fontWeight: tab === t ? 700 : 400,
                fontSize: '0.875rem',
                padding: '0.6rem',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {t === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
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
          {tab === 'create' && (
            <>
              <div>
                <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
                  Team Name
                </label>
                <input
                  style={inp}
                  placeholder="e.g. Rapaziada FC"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
                  Email <span style={{ color: C.gold }}>(recommended — get a Total90 Sessions invite + future updates)</span>
                </label>
                <input
                  style={inp}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                {!email && (
                  <p style={{ color: '#4A6080', fontSize: '0.72rem', margin: '0.35rem 0 0' }}>
                    Without an email, you can&apos;t recover a forgotten PIN.
                  </p>
                )}
              </div>
            </>
          )}
          <div>
            <label style={{ color: C.muted, fontSize: '0.78rem', display: 'block', marginBottom: '0.4rem' }}>
              4-Digit PIN
            </label>
            <input
              style={{ ...inp, letterSpacing: '0.3em', textAlign: 'center' as const }}
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            />
          </div>
          {tab === 'signin' && (
            <p style={{ color: '#4A6080', fontSize: '0.75rem', margin: 0 }}>
              Use the first name you registered with.
            </p>
          )}
          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: 0 }}>
              {error}
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
              fontFamily: 'inherit'
            }}
          >
            {loading ? 'Loading…' : tab === 'signin' ? 'Sign In →' : 'Create Account →'}
          </button>
        </div>
      </div>
    </div>
  )
}
