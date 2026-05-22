/**
 * /predictor/scoring — standalone scoring rules page.
 *
 * Linked from:
 *   - the /predictor home Scoring tab (also embeds the same content)
 *   - each league home page (also embeds the same content)
 *
 * Content lives in <ScoringRulesContent /> so all three surfaces stay in sync.
 */

import Link from 'next/link'
import AuthHeader from '@/components/AuthHeader'
import ScoringRulesContent from '@/components/predictor/ScoringRulesContent'

const C = {
  gold: '#FBBF24',
  muted: '#8899CC',
}

export default function ScoringRulesPage() {
  return (
    <>
      <AuthHeader />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <Link href="/predictor" style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to Predictor</Link>
        </div>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 4vw, 1.9rem)',
          fontWeight: 900,
          color: C.gold,
          margin: '0 0 0.4rem',
          letterSpacing: '-0.02em',
        }}>Scoring Rules</h1>
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
          How points work in the Total90 World Cup score predictor.
        </p>

        <ScoringRulesContent />
      </main>
    </>
  )
}
