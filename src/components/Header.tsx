'use client'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  text: '#F0F4FF',
  muted: '#8899CC',
}

interface HeaderProps {
  displayName: string | null
  onSignIn: () => void
  onSignOut: () => void
}

export default function Header({ displayName, onSignIn, onSignOut }: HeaderProps) {
  return (
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img
            src="/total90-logo-green.png"
            alt="Total90"
            style={{ width: '32px', height: '32px', objectFit: 'contain' }}
          />
          <span style={{ color: C.gold, fontWeight: 700, fontSize: '1rem' }}>
            World Cup 2026
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {displayName ? (
            <>
              <span style={{ color: C.text, fontSize: '0.875rem', fontWeight: 600 }}>
                {displayName}
              </span>
              <button
                onClick={onSignOut}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.5rem',
                  color: C.muted,
                  fontSize: '0.75rem',
                  padding: '0.4rem 0.75rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={onSignIn}
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
  )
}
