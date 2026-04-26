import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Total90 WC26 — World Cup 2026 Hub',
  description: 'Your World Cup 2026 command center — live news, S³ player ratings, bracket challenge & live scores. Powered by Total90 Intelligence.',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Total90 WC26 — World Cup 2026 Hub',
    description: 'Live news, S³ player ratings, bracket challenge & scores. Powered by Total90 Intelligence.',
    url: 'https://wc26.total90.com',
    siteName: 'Total90 WC26',
    images: [
      {
        url: 'https://wc26.total90.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Total90 WC26 — World Cup 2026 Hub',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Total90 WC26 — World Cup 2026 Hub',
    description: 'Live news, S³ player ratings, bracket challenge & scores.',
    images: ['https://wc26.total90.com/og-image.png'],
  },
}

const NAV_LINKS = [
  { label: 'News', href: '/news' },
  { label: 'S³ Ratings', href: '/s3' },
  { label: 'Bracket', href: '/bracket' },
  { label: 'Scores', href: '/scores' },
]

function SiteNav() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      backgroundColor: 'rgba(10,15,46,0.97)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid #1E3A6E',
      padding: '0.6rem 1rem',
    }}>
      {/* Row 1: Logo centered */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <img src="/total90-logo-green.png" alt="Total90" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
          <span style={{ color: '#00E676', fontWeight: 900, fontSize: '1rem', letterSpacing: '-0.01em' }}>TOTAL90</span>
          <span style={{ color: '#FBBF24', fontWeight: 700, fontSize: '0.9rem' }}>WC26</span>
        </Link>
      </div>
      {/* Row 2: Nav links + app link */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
        {NAV_LINKS.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            style={{
              color: '#8899CC',
              fontSize: '0.78rem',
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Link>
        ))}

      </div>
    </nav>
  )
}



export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{
        margin: 0, padding: 0,
        backgroundColor: '#0A0F2E',
        color: '#F0F4FF',
        fontFamily: "system-ui, -apple-system, sans-serif",

      }}>
        <SiteNav />
        {children}
        {/* Floating app button - always visible */}
        <a
          href="https://apps.apple.com/us/app/total90/id6749282785"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'fixed',
            bottom: '5rem',
            right: '1rem',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: '#00E676',
            color: '#0A0F2E',
            fontWeight: 800,
            fontSize: '0.72rem',
            padding: '0.5rem 0.875rem',
            borderRadius: '2rem',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(0,230,118,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          ⚽ App
        </a>
      </body>
    </html>
  )
}
