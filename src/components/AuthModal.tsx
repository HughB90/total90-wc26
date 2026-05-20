'use client'

import { useEffect, useState } from 'react'
import AuthForm, { type AuthFormProfile } from './AuthForm'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Legacy-shape callback (matches the existing bracket page).
   * Receives (profile_id, display_name_or_manager_name).
   */
  onAuth: (id: string, name: string) => void
}

export default function AuthModal({ isOpen, onClose, onAuth }: AuthModalProps) {
  // Lock body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const [pickerProfiles, setPickerProfiles] = useState<AuthFormProfile[] | null>(null)
  const [pickerError, setPickerError] = useState('')

  // Reset picker state whenever the modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setPickerProfiles(null)
      setPickerError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const finishAuth = (profile: AuthFormProfile) => {
    onAuth(profile.id, profile.display_name || profile.manager_name || profile.first_name)
    onClose()
  }

  const handlePickProfile = async (profile: AuthFormProfile) => {
    setPickerError('')
    const res = await fetch('/api/auth/pick-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profile.id }),
    })
    const data = await res.json()
    if (!res.ok || !data.profile) {
      setPickerError(data.error ?? 'Could not pick profile')
      return
    }
    try {
      localStorage.setItem('bracket_user_id', data.profile.id)
      localStorage.setItem(
        'bracket_display_name',
        data.profile.display_name || data.profile.manager_name || data.profile.first_name
      )
    } catch {}
    finishAuth(data.profile)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 15, 46, 0.95)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          backgroundColor: '#0F1C4D',
          border: '1px solid #1E3A6E',
          borderRadius: '1.25rem',
          padding: '2rem 1.5rem',
          maxWidth: '440px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: '#8899CC',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0.25rem',
            lineHeight: 1,
            fontFamily: 'inherit',
          }}
          aria-label="Close"
        >
          ×
        </button>

        {pickerProfiles ? (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#FBBF24', fontWeight: 800, fontSize: '1.25rem', margin: '0 0 1rem' }}>
              Who&apos;s playing?
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              {pickerProfiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => handlePickProfile(p)}
                  style={{
                    background: '#162040',
                    border: '1px solid #1E3A6E',
                    borderRadius: '0.75rem',
                    padding: '0.9rem 0.75rem',
                    color: '#F0F4FF',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg,#10B981,#0EA5A4)',
                      color: '#0A0F2E',
                      fontWeight: 900,
                      fontSize: '1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 0.5rem',
                    }}
                  >
                    {p.first_name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.first_name}</div>
                  <div style={{ color: '#8899CC', fontSize: '0.75rem', marginTop: 2 }}>{p.manager_name}</div>
                  {p.is_owner && (
                    <div style={{ color: '#FBBF24', fontSize: '0.65rem', marginTop: 4 }}>OWNER</div>
                  )}
                </button>
              ))}
            </div>
            {pickerError && (
              <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>{pickerError}</p>
            )}
            <button
              type="button"
              onClick={() => setPickerProfiles(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#8899CC',
                fontSize: '0.78rem',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← Back to sign-in
            </button>
          </div>
        ) : (
          <AuthForm
            onAuth={finishAuth}
            onProfilePickerNeeded={profiles => setPickerProfiles(profiles)}
            isModal
          />
        )}
      </div>
    </div>
  )
}
