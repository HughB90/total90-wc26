/**
 * <ScoringRulesContent /> — shared rules content used in three surfaces:
 *   - /predictor/scoring (standalone page)
 *   - /predictor (Scoring tab)
 *   - /predictor/leagues/[id] (Scoring tab)
 *
 * Wave D will ship the scoring engine; this content is the canonical
 * user-facing description of how points work and must stay in sync
 * across all three surfaces. Edit here, not in each page.
 */

import type { CSSProperties, ReactNode } from 'react'

const C = {
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

export default function ScoringRulesContent() {
  return (
    <div style={{ minWidth: 0 }}>
      <Section title="Per-match (Rounds 1–8)" rows={PER_MATCH} />

      <Card>
        <h3 style={cardTitleStyle}>Starred picks</h3>
        <p style={{ color: C.text, margin: '0 0 0.5rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Star a match to <strong style={{ color: C.gold }}>double</strong> its score.
        </p>
        <ul style={{ color: C.muted, margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
          <li>1 star per round in Rounds 1–4. 4 stars across the tournament.</li>
          <li>Rounds 5–8 (R16 onwards) have no stars — the Anytime Goalscorer pick takes over.</li>
        </ul>
      </Card>

      <Section title="Knockouts (Rounds 4–8)" rows={KNOCKOUTS} />

      <Card>
        <h3 style={cardTitleStyle}>Anytime Goalscorer (Rounds 5–8)</h3>
        <p style={{ color: C.text, margin: '0 0 0.6rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Pick one player per knockout match. If they score, you get the bonus.
        </p>
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {GOALSCORER.map((r) => (
            <RuleLine key={r.label} row={r} />
          ))}
        </div>
        <p style={{ color: C.muted, margin: '0.6rem 0 0', fontSize: '0.75rem', lineHeight: 1.5 }}>
          No cap. Nail every match and stack the points.
        </p>
      </Card>

      <Section title="Tournament winner" rows={WINNER} />

      <Card>
        <h3 style={cardTitleStyle}>Leaderboard</h3>
        <ul style={{ color: C.muted, margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
          <li>Updates as matches go final.</li>
          <li>Per-round totals plus a running tournament total.</li>
          <li>Global leaderboard ranks everyone playing. League leaderboards rank just your league.</li>
        </ul>
      </Card>

      <div style={{
        marginTop: '1rem',
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
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: RuleRow[] }) {
  return (
    <Card>
      <h3 style={cardTitleStyle}>{title}</h3>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {rows.map((r) => (
          <RuleLine key={r.label} row={r} />
        ))}
      </div>
    </Card>
  )
}

function RuleLine({ row }: { row: RuleRow }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: '0.75rem',
      padding: '0.5rem 0.7rem',
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${C.borderSoft}`,
      borderRadius: '0.5rem',
      minWidth: 0,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: '0.85rem', fontWeight: 600 }}>{row.label}</div>
        {row.hint && <div style={{ color: C.muted, fontSize: '0.74rem', marginTop: '0.15rem' }}>{row.hint}</div>}
      </div>
      <div style={{ color: C.green, fontSize: '0.9rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{row.value}</div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: '0.85rem',
      padding: '1.15rem 1.25rem',
      marginBottom: '1rem',
      minWidth: 0,
    }}>
      {children}
    </div>
  )
}

const cardTitleStyle: CSSProperties = {
  color: C.gold,
  fontSize: '0.95rem',
  fontWeight: 800,
  margin: '0 0 0.6rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
