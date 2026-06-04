/**
 * <ScoringRulesContent /> — shared rules content used in three surfaces:
 *   - /predictor/scoring (standalone page)
 *   - /predictor (Scoring tab)
 *   - /predictor/leagues/[id] (Scoring tab)
 *
 * Source of truth: docs/PREDICTOR-SCORING-RULES.md (v2, bundled-pick model,
 * locked 2026-06-03 by Hugh). If anything here disagrees with that doc, the
 * doc wins — please update both.
 *
 * Edit this file, not each page.
 */

import type { CSSProperties, ReactNode } from 'react'

const C = {
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  teal: '#22D3EE',
  red: '#F87171',
  muted: '#8899CC',
  text: '#F0F4FF',
}

interface RuleRow {
  label: string
  value: string
  valueColor?: string
  hint?: string
}

const PER_MATCH: RuleRow[] = [
  { label: 'Exact score correct',           value: '10 pts', valueColor: C.teal,  hint: 'Scoreline matches (90+ET).' },
  { label: 'Correct result, score wrong',   value: '4 pts',  valueColor: C.green, hint: 'Right winner (or right draw), wrong scoreline.' },
  { label: 'Wrong',                         value: '0 pts',  valueColor: C.red },
]

const KO_DRAW: RuleRow[] = [
  { label: 'Exact (10)', value: '10 pts', valueColor: C.teal,  hint: 'Scoreline matches AND match went to PKs AND your PK side wins.' },
  { label: 'Result (4)', value: '4 pts',  valueColor: C.green, hint: 'Your PK side advances (even if the scoreline was off).' },
]

const KO_NONDRAW: RuleRow[] = [
  { label: 'Exact (10)', value: '10 pts', valueColor: C.teal,  hint: 'Scoreline matches AND match did NOT go to PKs.' },
  { label: 'Result (4)', value: '4 pts',  valueColor: C.green, hint: 'Your winning side advances (in 90, ET, or PKs).' },
]

const GOALSCORER: RuleRow[] = [
  { label: 'Anytime Goalscorer', value: '+2 pts', valueColor: C.green, hint: 'Per correct scorer (open play or ET — shootout goals don’t count).' },
]

const WINNER: RuleRow[] = [
  { label: 'Champion picked correctly', value: '+40 pts', valueColor: C.gold, hint: 'Locks at Round 1 kickoff. Counts no matter how the final ends (90 / ET / PKs).' },
]

export default function ScoringRulesContent() {
  return (
    <div style={{ minWidth: 0 }}>
      {/* Per-match scoring */}
      <Section title="Per-match scoring (every round)" rows={PER_MATCH} />
      <NoteLine>
        Exact and result don’t stack — you get one or the other, never both.
      </NoteLine>

      {/* Starred picks */}
      <Card>
        <h3 style={cardTitleStyle}>Starred picks (R1–R4 only)</h3>
        <p style={{ color: C.text, margin: '0 0 0.5rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Star a match to <strong style={{ color: C.gold }}>double</strong> its total (×2).
        </p>
        <ul style={ulStyle}>
          <li>1 star per round in Rounds 1–4. 4 stars across the tournament.</li>
          <li>Rounds 5–8 (R16 onwards) have <strong>no stars</strong> — the Anytime Goalscorer takes over.</li>
        </ul>
      </Card>

      {/* Knockouts — bundled pick */}
      <Card>
        <h3 style={cardTitleStyle}>Knockouts (R4–R8) — the bundled-pick rule</h3>
        <p style={{ color: C.text, margin: '0 0 0.7rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
          A predicted <strong style={{ color: C.gold }}>draw</strong> in a knockout is a
          bundled prediction meaning <em>“this match goes to PKs, and X wins the shootout.”</em>
          The PK side is part of the same pick — it pays out through Exact / Result.
          There is <strong>no separate “+3 PK advancer” bonus</strong>.
        </p>

        <SubHeader>Predicted draw + PK winner</SubHeader>
        <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.7rem' }}>
          {KO_DRAW.map((r) => <RuleLine key={r.label} row={r} />)}
        </div>
        <p style={{ color: C.muted, margin: '0 0 0.9rem', fontSize: '0.75rem', lineHeight: 1.5 }}>
          No PK side picked → invalid pick → 0.
        </p>

        <SubHeader>Predicted non-draw</SubHeader>
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {KO_NONDRAW.map((r) => <RuleLine key={r.label} row={r} />)}
        </div>
      </Card>

      {/* Anytime Goalscorer */}
      <Card>
        <h3 style={cardTitleStyle}>Anytime Goalscorer (R5–R8 only)</h3>
        <p style={{ color: C.text, margin: '0 0 0.6rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Pick one player per knockout match. If they score in open play or ET, you get the bonus.
        </p>
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {GOALSCORER.map((r) => <RuleLine key={r.label} row={r} />)}
        </div>
        <ul style={{ ...ulStyle, marginTop: '0.7rem' }}>
          <li><strong>Independent of the result</strong> — if your player scores, you get +2 even if the rest of your pick was wrong.</li>
          <li><strong>Shootout goals don’t count.</strong></li>
          <li>No tournament-wide cap. Nail every match and stack the points.</li>
        </ul>
      </Card>

      {/* Tournament winner */}
      <Section title="Tournament winner" rows={WINNER} />

      {/* Tiebreakers */}
      <Card>
        <h3 style={cardTitleStyle}>Tiebreakers</h3>
        <ol style={{ ...ulStyle, paddingLeft: '1.4rem' }}>
          <li>Total points</li>
          <li>Most exact scores correct</li>
          <li>Most correct results (exact OR result)</li>
          <li>Alphabetical manager name</li>
        </ol>
      </Card>

      {/* Leaderboard */}
      <Card>
        <h3 style={cardTitleStyle}>Leaderboard</h3>
        <ul style={ulStyle}>
          <li>Updates as matches go final.</li>
          <li>Per-round totals plus a running tournament total.</li>
          <li>Global leaderboard ranks everyone playing. League leaderboards rank just your league.</li>
        </ul>
      </Card>
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: RuleRow[] }) {
  return (
    <Card>
      <h3 style={cardTitleStyle}>{title}</h3>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {rows.map((r) => <RuleLine key={r.label} row={r} />)}
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
        {row.hint && <div style={{ color: C.muted, fontSize: '0.74rem', marginTop: '0.15rem', lineHeight: 1.45 }}>{row.hint}</div>}
      </div>
      <div style={{
        color: row.valueColor ?? C.green,
        fontSize: '0.9rem',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}>
        {row.value}
      </div>
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

function SubHeader({ children }: { children: ReactNode }) {
  return (
    <div style={{
      color: C.gold,
      fontSize: '0.78rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      margin: '0 0 0.45rem',
    }}>
      {children}
    </div>
  )
}

function NoteLine({ children }: { children: ReactNode }) {
  return (
    <div style={{
      margin: '-0.4rem 0 1rem',
      padding: '0.6rem 0.9rem',
      borderRadius: '0.55rem',
      background: 'rgba(251,191,36,0.06)',
      border: '1px solid rgba(251,191,36,0.22)',
      color: C.muted,
      fontSize: '0.78rem',
      lineHeight: 1.5,
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

const ulStyle: CSSProperties = {
  color: C.muted,
  margin: 0,
  paddingLeft: '1.25rem',
  fontSize: '0.82rem',
  lineHeight: 1.6,
}
