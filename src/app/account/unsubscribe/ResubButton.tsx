'use client'

/**
 * "Resubscribe" button. Token-based — POSTs to /api/account/email-prefs/resub.
 * On success, swaps to a confirmation state.
 */

import { useState } from 'react'

export default function ResubButton({
  token,
  type,
  all,
}: {
  token: string
  type?: string
  all: boolean
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function resub() {
    setState('loading')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/account/email-prefs/resub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type, all }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to resubscribe.')
      }
      setState('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to resubscribe.')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div
        style={{
          background: '#0A1530',
          border: '1px solid #1E3A6E',
          borderRadius: '0.75rem',
          padding: '0.75rem 1rem',
          color: '#8899CC',
          fontSize: '0.9rem',
        }}
      >
        ✓ You&apos;re resubscribed.{' '}
        {all ? 'All Total90 emails are back on.' : 'You&apos;ll receive these again.'}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={resub}
        disabled={state === 'loading'}
        style={{
          background: 'transparent',
          color: '#FBBF24',
          border: '1px solid #FBBF24',
          padding: '0.75rem 1.25rem',
          borderRadius: '0.75rem',
          fontWeight: 700,
          fontSize: '0.95rem',
          cursor: state === 'loading' ? 'wait' : 'pointer',
          opacity: state === 'loading' ? 0.6 : 1,
        }}
      >
        {state === 'loading' ? 'Resubscribing…' : 'Changed your mind? Resubscribe'}
      </button>
      {errorMsg ? (
        <p style={{ color: '#F87171', fontSize: '0.8rem', marginTop: '0.75rem' }}>{errorMsg}</p>
      ) : null}
    </>
  )
}
