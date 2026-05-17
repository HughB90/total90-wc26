'use client'

import { useEffect } from 'react'
import AuthForm from './AuthForm'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onAuth: (id: string, name: string) => void
}

export default function AuthModal({ isOpen, onClose, onAuth }: AuthModalProps) {
  // Prevent body scroll when modal is open
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

  if (!isOpen) return null

  const handleAuth = (id: string, name: string) => {
    onAuth(id, name)
    onClose()
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
          maxWidth: '420px',
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
        <AuthForm onAuth={handleAuth} isModal={true} />
      </div>
    </div>
  )
}
