'use client'
import { useState } from 'react'
import Link from 'next/link'

const WC26_DATE = new Date('2026-06-11T00:00:00Z')

function useCountdown() {
  const now = new Date()
  const diff = WC26_DATE.getTime() - now.getTime()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)
  return { days, hours, minutes, seconds }
}

export default function BracketPage() {
  const countdown = useCountdown()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || submitting) return
    setSubmitting(true)
    try {
      await fetch('/api/bracket/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSubmitted(true)
    } catch {
      // silent
    }
    setSubmitting(false)
  }

  return (
    <div style={{ backgroundColor: '#0A0F2E', minHeight: '100vh', color: '#F0F4FF', fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <nav style={{ borderBottom: '1px solid #1E3A6E', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#00E676', fontWeight: 800, textDecoration: 'none', fontSize: '1rem' }}>
          TOTAL90 <span style={{ color: '#FBBF24' }}>WC26</span>
        </Link>
        <span style={{ color: '#4A6080' }}>/</span>
        <span style={{ color: '#8899CC', fontSize: '0.9rem' }}>Bracket</span>
      </nav>

      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏆</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FBBF24', margin: '0 0 0.75rem' }}>Bracket Challenge</h1>
        <p style={{ color: '#8899CC', fontSize: '1rem', margin: '0 0 2.5rem', lineHeight: 1.6 }}>
          Pick your group winners and knockout bracket. Opens when World Cup groups are confirmed.
        </p>

        {/* Countdown */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '3rem' }}>
          {[
            { label: 'Days',    value: countdown.days },
            { label: 'Hours',   value: countdown.hours },
            { label: 'Minutes', value: countdown.minutes },
            { label: 'Seconds', value: countdown.seconds },
          ].map(({ label, value }) => (
            <div key={label} style={{
              backgroundColor: '#0F1C4D',
              border: '1px solid #1E3A6E',
              borderRadius: '1rem',
              padding: '1rem 1.25rem',
              minWidth: '70px',
            }}>
              <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#FBBF24', lineHeight: 1 }}>
                {String(value).padStart(2, '0')}
              </p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: '#8899CC', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Email capture */}
        {submitted ? (
          <div style={{
            backgroundColor: '#0F1C4D',
            border: '1px solid rgba(0,230,118,0.3)',
            borderRadius: '1rem',
            padding: '1.5rem',
          }}>
            <p style={{ color: '#00E676', fontWeight: 700, margin: 0 }}>✅ You&apos;re on the list!</p>
            <p style={{ color: '#8899CC', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>We&apos;ll notify you when the bracket opens.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <p style={{ color: '#8899CC', fontSize: '0.875rem', margin: '0 0 0.25rem' }}>Get notified when it launches:</p>
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '400px' }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  flex: 1,
                  backgroundColor: '#0F1C4D',
                  border: '1px solid #1E3A6E',
                  borderRadius: '0.75rem',
                  padding: '0.6rem 1rem',
                  color: '#F0F4FF',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={submitting}
                style={{
                  backgroundColor: '#FBBF24',
                  color: '#0A0F2E',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '0.75rem',
                  border: 'none',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '...' : 'Notify Me'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
