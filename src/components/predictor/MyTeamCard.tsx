/**
 * <MyTeamCard /> — Leaderboard tab "My Team" pill.
 *
 * Shows the current profile's manager display name + manager_name,
 * total score, and a per-round badge strip (R1..R8 + WIN). Scores
 * come in as zeros until Wave D ships the scoring engine.
 */

import type { CSSProperties } from 'react'
import { profileFullName } from '@/lib/predictor/display-name'

const C = {
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  muted: '#8899CC',
  text: '#F0F4FF',
}

interface RoundScore {
  code: string
  label: string
  score: number
}

const ROUND_LABELS: { code: string; label: string }[] = [
  { code: 'group_r1', label: 'R1' },
  { code: 'group_r2', label: 'R2' },
  { code: 'group_r3', label: 'R3' },
  { code: 'r32',      label: 'R4' },
  { code: 'r16',      label: 'R5' },
  { code: 'qf',       label: 'R6' },
  { code: 'sf',       label: 'R7' },
  { code: 'final',    label: 'R8' },
]

export interface MyTeamCardProps {
  authed: boolean
  // Team / FC name shown on leaderboards (profiles.manager_name)
  // e.g. "Rapaziada FC".
  managerName: string | null
  // Person's first name (profiles.first_name) e.g. "Hugh".
  firstName: string | null
  // Person's last name (profiles.last_name) e.g. "Brown". Optional —
  // legacy profiles created before 2026-06-04 may not have one.
  lastName: string | null
  total: number                // all-rounds total
  // Per-round scores keyed by round_code; missing keys render as 0.
  perRound: Record<string, number>
  winnerScore: number          // 0 or 40
  // Caller's global rank (1-indexed). null = unranked / still loading.
  globalRank?: number | null
  // Total managers in the global ranking (denominator). null when unknown.
  globalTotal?: number | null
}

export default function MyTeamCard({
  authed,
  managerName,
  firstName,
  lastName,
  total,
  perRound,
  winnerScore,
  globalRank = null,
  globalTotal = null,
}: MyTeamCardProps) {
  const rounds: RoundScore[] = ROUND_LABELS.map((rm) => ({
    code: rm.code,
    label: rm.label,
    score: perRound[rm.code] ?? 0,
  }))

  return (
    <div style={cardOuter}>
      <div style={cardHeader}>
        <span>My Team</span>
        {authed && (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {globalRank != null && (
              <span style={{ color: C.muted, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                GLOBAL <span style={{ color: C.text }}>#{globalRank}</span>
                {globalTotal != null && (
                  <span style={{ color: C.muted }}> / {globalTotal}</span>
                )}
              </span>
            )}
            <span style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 800 }}>
              Total: {total}
            </span>
          </span>
        )}
      </div>

      {!authed ? (
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
          Sign in up top to track your picks and climb the leaderboard.
        </p>
      ) : (
        <>
          <div style={{
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.45rem',
            flexWrap: 'wrap',
            minWidth: 0,
          }}>
            <span style={{
              color: C.text,
              fontSize: '1rem',
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}>{managerName ?? firstName ?? 'Manager'}</span>
            {(() => {
              const sub = profileFullName(firstName, lastName, managerName)
              return sub ? (
                <span style={{ color: C.muted, fontSize: '0.78rem' }}>· {sub}</span>
              ) : null
            })()}
          </div>

          <div style={{
            marginTop: '0.7rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
            gap: '0.3rem',
            minWidth: 0,
          }}>
            {rounds.map((r) => (
              <Badge key={r.code} label={r.label} value={r.score} />
            ))}
            <Badge label="WIN" value={winnerScore} accent />
          </div>
        </>
      )}
    </div>
  )
}

function Badge({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      backgroundColor: 'rgba(255,255,255,0.02)',
      border: `1px solid ${accent ? 'rgba(251,191,36,0.3)' : C.borderSoft}`,
      borderRadius: '0.4rem',
      padding: '0.32rem 0.1rem',
      textAlign: 'center',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        color: accent ? C.gold : C.muted,
        fontSize: '0.6rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        lineHeight: 1.1,
      }}>{label}</div>
      <div style={{
        color: accent ? C.gold : C.text,
        fontSize: '0.85rem',
        fontWeight: 800,
        lineHeight: 1.1,
        marginTop: '0.15rem',
      }}>{value}</div>
    </div>
  )
}

const cardOuter: CSSProperties = {
  backgroundColor: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: '0.85rem',
  padding: '0.9rem 1rem 1rem',
  minWidth: 0,
  overflow: 'hidden',
}

const cardHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
  color: C.gold,
  fontSize: '0.74rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  minWidth: 0,
}
