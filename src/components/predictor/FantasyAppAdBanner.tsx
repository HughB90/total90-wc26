'use client'

/**
 * FantasyAppAdBanner
 * ------------------
 * Full-width horizontal ad banner shown at the top of every /predictor route.
 * Replaces the floating green "Get the Fantasy App" pill that was covering the
 * Submit button on pick pages.
 *
 * Style inspiration: fubotv's "WATCH LIVE ON fubo ▶" strip — bold color block,
 * short punchy copy, clear CTA, unmistakable as an ad.
 */
export default function FantasyAppAdBanner() {
  return (
    <a
      href="https://apps.apple.com/us/app/total90/id6749282785"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download the Total90 Fantasy app on the App Store"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.65rem',
        width: '100%',
        padding: '0.6rem 1rem',
        background:
          'linear-gradient(90deg, #00E676 0%, #00C853 55%, #009F42 100%)',
        color: '#0A0F2E',
        textDecoration: 'none',
        fontWeight: 800,
        fontSize: '0.85rem',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        boxShadow: '0 2px 12px rgba(0,230,118,0.25)',
        borderBottom: '1px solid rgba(0,0,0,0.15)',
        lineHeight: 1.2,
      }}
    >
      <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚽</span>
      <span style={{ whiteSpace: 'nowrap' }}>Play the</span>
      <span
        style={{
          fontSize: '0.95rem',
          fontWeight: 900,
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}
      >
        TOTAL90 FANTASY
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>app</span>
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.4rem',
          height: '1.4rem',
          borderRadius: '999px',
          backgroundColor: '#0A0F2E',
          color: '#00E676',
          fontSize: '0.75rem',
          fontWeight: 900,
          marginLeft: '0.15rem',
          flexShrink: 0,
        }}
      >
        ▶
      </span>
    </a>
  )
}
