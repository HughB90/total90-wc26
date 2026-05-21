/**
 * /predictor/scoring — static scoring rules page.
 *
 * Linked from:
 *   - the home Global Leaderboard + Leagues panel ("Scoring" link)
 *   - each league home page (as a tab)
 *
 * Wave D will actually wire the scoring engine; this page is the
 * canonical user-facing description of how points work.
 */

import Link from 'next/link'
import AuthHeader from '@/components/AuthHeader'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
}

interface RuleRow {
  label: string
  value: string
  hint?: string
}

const PER_MATCH: RuleRow[] = [
  { label: 'Exact score',         value: '10 pts' },
  { label: 'Correct result',      value: '4 pts',  hint: 'W/D/L without the exact score' },
  { label: 'Goal difference',     value: '+2 pts', hint: 'Right margin, wrong scoreline' },
  { label: 'Both teams scored',   value: '+1 pt',  hint: 'Correctly called BTTS' },
]

const KNOCKOUTS: RuleRow[] = [
  { label: 'Advancer on PKs',     value: '+3 pts', hint: 'If your pick is a draw at 90 in R4–R8' },
]

const GOALSCORER: RuleRow[] = [
  { label: 'Anytime Goalscorer',  value: '+2 pts', hint: 'Per correct goalscorer pick (open play or ET — no shootout goals)' },
]

const WINNER: RuleRow[] = [
  { label: 'Champion picked correctly', value: '+40 pts', hint: 'Locks at Round 1 kickoff' },
]

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

        <Section title="Per-match (Rounds 1–8)" rows={PER_MATCH} />

        <Card>
          <h3 style={{ color: C.gold, fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Starred picks</h3>
          <p style={{ color: C.text, margin: '0 0 0.5rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Star a match to <strong style={{ color: C.gold }}>double</strong> its score.
          </p>
          <ul style={{ color: C.muted, margin: '0', paddingLeft: '1.25rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
            <li>1 star per round in Rounds 1–4. 4 stars across the tournament.</li>
            <li>Rounds 5–8 (R16 onwards) have no stars — the Anytime Goalscorer pick takes over.</li>
          </ul>
        </Card>

        <Section title="Knockouts (Rounds 4–8)" rows={KNOCKOUTS} />

        <Card>
          <h3 style={{ color: C.gold, fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Anytime Goalscorer (Rounds 5–8)</h3>
          <p style={{ color: C.text, margin: '0 0 0.6rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Pick one player per knockout match. If they score, you get the bonus.
          </p>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {GOALSCORER.map((r) => (
              <div key={r.label} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '0.75rem',
                padding: '0.5rem 0.7rem',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${C.borderSoft}`,
                borderRadius: '0.5rem',
              }}>
                <div>
                  <div style={{ color: C.text, fontSize: '0.85rem', fontWeight: 600 }}>{r.label}</div>
                  {r.hint && <div style={{ color: C.muted, fontSize: '0.74rem', marginTop: '0.15rem' }}>{r.hint}</div>}
                </div>
                <div style={{ color: C.green, fontSize: '0.9rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{r.value}</div>
              </div>
            ))}
          </div>
          <p style={{ color: C.muted, margin: '0.6rem 0 0', fontSize: '0.75rem', lineHeight: 1.5 }}>
            No cap. Nail every match and stack the points.
          </p>
        </Card>

        <Section title="Tournament winner" rows={WINNER} />

        <Card>
          <h3 style={{ color: C.gold, fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Leaderboard</h3>
          <ul style={{ color: C.muted, margin: '0', paddingLeft: '1.25rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
            <li>Updates as matches go final.</li>
            <li>Per-round totals plus a running tournament total.</li>
            <li>Global leaderboard ranks everyone playing. League leaderboards rank just your league.</li>
          </ul>
        </Card>

        <div style={{
          marginTop: '1.5rem',
          padding: '0.85rem 1rem',
          borderRadius: '0.6rem',
          background: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.25)',
          color: C.muted,
          fontSize: '0.78rem',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: C.gold }}>Heads up:</strong> the scoring engine ships
          alongside Round 1 kickoff. Until then, leaderboards display zeros for
          everyone — your picks are saving correctly.
        </div>
      </main>
    </>
  )
}

function Section({ title, rows }: { title: string; rows: RuleRow[] }) {
  return (
    <Card>
      <h3 style={{ color: C.gold, fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {rows.map((r) => (
          <div key={r.label} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '0.75rem',
            padding: '0.5rem 0.7rem',
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${C.borderSoft}`,
            borderRadius: '0.5rem',
          }}>
            <div>
              <div style={{ color: C.text, fontSize: '0.85rem', fontWeight: 600 }}>{r.label}</div>
              {r.hint && <div style={{ color: C.muted, fontSize: '0.74rem', marginTop: '0.15rem' }}>{r.hint}</div>}
            </div>
            <div style={{ color: C.green, fontSize: '0.9rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{r.value}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: '0.85rem',
      padding: '1.15rem 1.25rem',
      marginBottom: '1rem',
    }}>
      {children}
    </div>
  )
}
