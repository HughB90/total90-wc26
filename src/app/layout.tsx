import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Total90 WC26 — World Cup 2026 Hub',
  description: 'Your World Cup 2026 command center — live news powered by Grok, S³ player ratings (Sign · Sell · Sack), bracket challenge, and live scores. Total90 Intelligence.',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png', type: 'image/png' },
    ],
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        margin: 0,
        padding: 0,
        backgroundColor: '#0A0F2E',
        color: '#F0F4FF',
        fontFamily: "'Poppins', system-ui, -apple-system, sans-serif",
      }}>
        {children}
      </body>
    </html>
  )
}
