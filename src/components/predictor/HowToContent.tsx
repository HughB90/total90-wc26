/**
 * <HowToContent /> — user-facing "How To" guide, rendered in the
 * Predictor "How To" tab (next to Scoring).
 *
 * Stub copy by Hugh 2026-06-03. Polish + screenshots/GIFs come later.
 * Edit here, not in each page surface.
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

interface Step {
  title: string
  body: ReactNode
}

const STEPS: Step[] = [
  {
    title: '1. Create a login',
    body: (
      <>
        Sign up with your email and password. You can add child profiles to
        your account so the whole family can play under one parent login.
      </>
    ),
  },
  {
    title: '2. Go to the Predictor tab',
    body: (
      <>
        From the WC26 home, tap <strong style={{ color: C.gold }}>Predictor</strong>{' '}
        in the main nav.
      </>
    ),
  },
  {
    title: '3. Select your profile',
    body: (
      <>
        Make sure you've picked the right profile (parent or one of your kids)
        before making predictions — picks save to whichever profile is active.
      </>
    ),
  },
  {
    title: '4. Pick your tournament winner',
    body: (
      <>
        Choose who you think lifts the trophy. Worth{' '}
        <strong style={{ color: C.green }}>+40 pts</strong> if you're right.{' '}
        <strong>Locks at Round 1 kickoff</strong> — no changes after that.
      </>
    ),
  },
  {
    title: '5. Fill out your match predictions',
    body: (
      <>
        Group stage Round 1 has 24 matches across 6 days — predict at least{' '}
        <strong>16 of 24</strong> to qualify for the round. Then repeat for Rounds
        2 and 3. You can fill out all group-stage matches early if you want.
        <br /><br />
        <strong style={{ color: C.gold }}>Each round locks 1 minute before kickoff</strong>{' '}
        of the first match in that round. After lock, picks for that round are
        final and visible to everyone.
      </>
    ),
  },
  {
    title: '6. How scoring works',
    body: (
      <>
        See the <strong style={{ color: C.gold }}>Scoring</strong> tab for the full
        breakdown — exact scores, correct results, starred matches, knockout
        bonuses, anytime goalscorers, and the tournament-winner pick.
      </>
    ),
  },
]

export default function HowToContent() {
  return (
    <div style={{ minWidth: 0 }}>
      <Card>
        <p style={{ color: C.text, margin: 0, fontSize: '0.9rem', lineHeight: 1.55 }}>
          New to the Total90 WC26 Predictor? Here's the quick version.
        </p>
      </Card>

      {STEPS.map((s) => (
        <Card key={s.title}>
          <h3 style={cardTitleStyle}>{s.title}</h3>
          <p style={{ color: C.text, margin: 0, fontSize: '0.86rem', lineHeight: 1.6 }}>
            {s.body}
          </p>
        </Card>
      ))}

      <div style={{
        marginTop: '0.5rem',
        padding: '0.85rem 1rem',
        borderRadius: '0.6rem',
        background: 'rgba(251,191,36,0.06)',
        border: '1px solid rgba(251,191,36,0.25)',
        color: C.muted,
        fontSize: '0.78rem',
        lineHeight: 1.55,
      }}>
        <strong style={{ color: C.gold }}>More coming:</strong> screenshots, a video
        walkthrough, and tips on stacking points with stars and goalscorer picks.
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

const cardTitleStyle: CSSProperties = {
  color: C.gold,
  fontSize: '0.95rem',
  fontWeight: 800,
  margin: '0 0 0.55rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
