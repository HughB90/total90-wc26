'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  text: '#F0F4FF',
  muted: '#8899CC',
}

const inp = (locked: boolean): React.CSSProperties => ({
  width: '100%',
  backgroundColor: locked ? '#0F1C4D' : '#162040',
  border: '1px solid #1E3A6E',
  borderRadius: '0.625rem',
  padding: '0.7rem 1rem',
  color: locked ? '#8899CC' : '#F0F4FF',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  cursor: locked ? 'not-allowed' : 'text',
})

const labelStyle: React.CSSProperties = {
  color: C.muted,
  fontSize: '0.78rem',
  display: 'block',
  marginBottom: '0.4rem',
}

const lockedHelper: React.CSSProperties = {
  color: '#FBBF24',
  fontSize: '0.72rem',
  margin: '0.35rem 0 0',
}

interface Props {
  profileId: string
  initialFirstName: string
  initialLastName: string
  initialManagerName: string
  isOwnerTarget: boolean
  nameLocked: boolean
}

export default function EditProfileForm({
  profileId,
  initialFirstName,
  initialLastName,
  initialManagerName,
  isOwnerTarget,
  nameLocked,
}: Props) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)
  const [managerName, setManagerName] = useState(initialManagerName)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!managerName.trim()) {
      setError('Team / manager name cannot be empty.')
      return
    }
    if (!nameLocked && (!firstName.trim() || !lastName.trim())) {
      setError('First and last name are required.')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, string> = {
        manager_name: managerName.trim(),
      }
      if (!nameLocked) {
        body.first_name = firstName.trim()
        body.last_name = lastName.trim()
      }

      const res = await fetch(`/api/auth/profiles/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Could not save changes.')
        return
      }

      setInfo('Saved.')
      router.refresh()
    } catch (err) {
      console.error(err)
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.bg,
        padding: '1.5rem 1.5rem 6rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '380px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingTop: '1rem' }}>
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
            Edit Profile
          </h1>
          <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
            {isOwnerTarget
              ? 'Update your account profile'
              : 'Update this player profile'}
          </p>
          {nameLocked && (
            <p
              style={{
                color: '#FBBF24',
                fontSize: '0.78rem',
                margin: '0.75rem 0 0',
                background: '#1E3A6E',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
              }}
            >
              Round 1 has started — names are locked. You can still update your
              team name.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
        >
          <div>
            <label htmlFor="firstName" style={labelStyle}>
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              readOnly={nameLocked}
              disabled={nameLocked}
              style={inp(nameLocked)}
            />
            {nameLocked && (
              <p style={lockedHelper}>Locked — Round 1 has started.</p>
            )}
          </div>

          <div>
            <label htmlFor="lastName" style={labelStyle}>
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              readOnly={nameLocked}
              disabled={nameLocked}
              style={inp(nameLocked)}
              placeholder={nameLocked ? '' : 'Add a last name'}
            />
            {nameLocked && (
              <p style={lockedHelper}>Locked — Round 1 has started.</p>
            )}
          </div>

          <div>
            <label htmlFor="managerName" style={labelStyle}>
              Team / Manager Name
            </label>
            <input
              id="managerName"
              type="text"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              style={inp(false)}
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
            type="submit"
            disabled={saving}
            style={{
              width: '100%',
              backgroundColor: saving ? '#162040' : C.gold,
              color: '#0A0F2E',
              fontWeight: 800,
              fontSize: '1rem',
              padding: '0.875rem',
              borderRadius: '0.875rem',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Save Changes →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
            <a
              href="/predictor"
              style={{
                color: C.muted,
                fontSize: '0.78rem',
                textDecoration: 'underline',
              }}
            >
              ← Back to dashboard
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
