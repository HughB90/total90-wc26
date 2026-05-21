'use client'

/**
 * /predictor/leaderboard — global leaderboard.
 * Sticky top-3, 25 rows/page, sticky my-row at viewport bottom.
 */

import Link from 'next/link'
import AuthHeader from '@/components/AuthHeader'
import PredictorLeaderboardTable from '@/components/PredictorLeaderboardTable'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  muted: '#8899CC',
  text: '#F0F4FF',
}

export default function GlobalLeaderboardPage() {
  return (
    <>
      <AuthHeader />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '1.25rem 1rem 6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Link href="/predictor" style={{ color: C.muted, textDecoration: 'none', fontSize: '0.78rem' }}>
            ← Predictor
          </Link>
        </div>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900, color: C.gold,
          margin: '0 0 0.25rem',
        }}>
          🌎 Global Leaderboard
        </h1>
        <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0 0 1rem' }}>
          Everyone playing the Total90 World Cup Predictor. Top 3 stay pinned.
          Your row stays glued to the bottom of the screen.
        </p>
        <PredictorLeaderboardTable leagueCode={null} pageSize={25} />
      </main>
    </>
  )
}
