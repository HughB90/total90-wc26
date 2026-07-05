/**
 * <PickSummaryRow /> — shared post-match-aware row for a single pick.
 *
 * Used on both:
 *   - /predictor (Picks tab, via PicksTabContent)
 *   - /predictor/leagues/[id] (My Picks tab)
 *
 * Behavior:
 *   - Pre-match (no actual scores): renders the pick scoreline + flags + star
 *     + goalscorer chip. No color band, no points.
 *   - Post-match (match.home_score & away_score non-null): adds an outcome
 *     color band (teal/green/red/gray) on the left edge, a "FINAL" tag, the
 *     actual scoreline + PK winner if applicable, and a points pill driven
 *     by the per-pick score breakdown (predictor_scores row, hydrated by the
 *     parent from GET /api/predictor/round/[round_code].my_scores).
 *
 * Outcome colors mirror src/lib/predictor/scoring.ts and the generated
 * outcome_color column on predictor_scores:
 *   teal  → exact (10)
 *   green → result correct or goalscorer hit (4 / +2)
 *   red   → pick made, no points
 *   gray  → no pick / not finalized
 */

'use client'

import type { CSSProperties } from 'react'
import { flagUrl } from '@/lib/predictor-flags'

const C = {
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
  red: '#F87171',
}

export type OutcomeColor = 'teal' | 'green' | 'red' | 'gray'

const OUTCOME_BORDER: Record<OutcomeColor, string> = {
  teal: '#22D3EE',
  green: '#00E676',
  red: '#F87171',
  gray: '#2a3550',
}
const OUTCOME_BG: Record<OutcomeColor, string> = {
  teal: 'rgba(34,211,238,0.10)',
  green: 'rgba(0,230,118,0.08)',
  red: 'rgba(248,113,113,0.07)',
  gray: 'rgba(255,255,255,0.02)',
}
const OUTCOME_LABEL: Record<OutcomeColor, string> = {
  teal: 'Exact!',
  green: 'Result',
  red: 'Miss',
  gray: 'No pick',
}

export interface PickSummaryScore {
  exact_pts: number
  result_pts: number
  scorer_pts: number
  star_multiplier: number
  total_pts: number
  outcome_color: OutcomeColor
}

export interface PickSummaryData {
  match_id: string
  home_team: string
  away_team: string
  /** User's predicted home score. Null = no pick. */
  pick_home: number | null
  /** User's predicted away score. Null = no pick. */
  pick_away: number | null
  is_star: boolean
  if_draw_winner: string | null
  goalscorer_name: string | null
  goalscorer_team: string | null
  /** Actual home score. Null until match finalizes. */
  actual_home: number | null
  /** Actual away score. Null until match finalizes. */
  actual_away: number | null
  went_to_pks: boolean
  pk_winner_team_code: string | null
  /** Score breakdown from predictor_scores. Null if score-match hasn't run. */
  score: PickSummaryScore | null
}

export function PickSummaryRow({
  pick,
  showGoalscorer,
}: {
  pick: PickSummaryData
  showGoalscorer: boolean
}) {
  const isFinalized = pick.actual_home !== null && pick.actual_away !== null
  const hasPick = pick.pick_home !== null && pick.pick_away !== null

  // Resolve outcome. If the match is final and we have a stored score row,
  // use its outcome_color (authoritative — comes from the generated column).
  // Otherwise: red if a pick exists, gray if not.
  const outcome: OutcomeColor = isFinalized
    ? (pick.score?.outcome_color ?? (hasPick ? 'red' : 'gray'))
    : 'gray'

  const showResult = isFinalized
  const borderColor = showResult ? OUTCOME_BORDER[outcome] : C.borderSoft
  const bgColor = showResult ? OUTCOME_BG[outcome] : 'rgba(255,255,255,0.02)'

  const totalPts = pick.score?.total_pts ?? 0
  const star2x = (pick.score?.star_multiplier ?? 1) === 2
  const scorerHit = (pick.score?.scorer_pts ?? 0) > 0
  const pkLine = pick.went_to_pks && pick.pk_winner_team_code
    ? ` · PKs: ${pick.pk_winner_team_code}`
    : ''

  return (
    <div style={{
      padding: '0.5rem 0.6rem',
      backgroundColor: bgColor,
      borderRadius: '0.4rem',
      border: `1px solid ${showResult ? `${OUTCOME_BORDER[outcome]}55` : C.borderSoft}`,
      borderLeft: `4px solid ${borderColor}`,
      minWidth: 0,
      display: 'grid',
      gap: '0.35rem',
    }}>
      {/* Top row: FINAL tag (if applicable) */}
      {showResult && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.65rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          <span style={{ color: OUTCOME_BORDER[outcome] }}>FINAL · {OUTCOME_LABEL[outcome]}</span>
          {hasPick && pick.score && (
            <span style={{ color: C.muted, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
              {pick.score.exact_pts > 0 ? '10 exact' : pick.score.result_pts > 0 ? '4 result' : '0 base'}
              {scorerHit && ' · +2 scorer'}
              {star2x && ' · ×2 star'}
            </span>
          )}
        </div>
      )}

      {/* Pick row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto auto',
        alignItems: 'center',
        gap: '0.4rem',
        minWidth: 0,
      }}>
        <span style={{
          color: C.text,
          fontSize: '0.8rem',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.35rem',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.home_team}</span>
          <img
            src={flagUrl(pick.home_team)}
            alt=""
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            style={{ width: 16, height: 11, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
          />
        </span>
        <strong style={{
          color: hasPick ? C.gold : C.muted,
          fontSize: '0.85rem',
          whiteSpace: 'nowrap',
          padding: '0 0.2rem',
        }}>
          {hasPick ? `${pick.pick_home} – ${pick.pick_away}` : '— – —'}
        </strong>
        <span style={{
          color: C.text,
          fontSize: '0.8rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}>
          <img
            src={flagUrl(pick.away_team)}
            alt=""
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            style={{ width: 16, height: 11, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.away_team}</span>
        </span>
        <span style={{
          color: C.gold,
          fontSize: '0.95rem',
          width: 14,
          textAlign: 'center',
          flexShrink: 0,
        }}>{pick.is_star ? '★' : ''}</span>
        {/* Points pill (only post-match) */}
        {showResult ? (
          <span style={{
            backgroundColor: outcome === 'gray' ? 'rgba(136,153,204,0.10)' : `${OUTCOME_BORDER[outcome]}22`,
            border: `1px solid ${OUTCOME_BORDER[outcome]}`,
            color: OUTCOME_BORDER[outcome],
            borderRadius: '999px',
            padding: '0.15rem 0.5rem',
            fontSize: '0.72rem',
            fontWeight: 900,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}>
            {totalPts > 0 ? `+${totalPts}` : totalPts}<span style={{ fontSize: '0.6rem', fontWeight: 700, marginLeft: '0.15rem', opacity: 0.85 }}>pts</span>
          </span>
        ) : (
          <span style={{ width: 0 }} />
        )}
      </div>

      {/* Actual result line (post-match only) */}
      {showResult && (
        <div style={{
          color: C.text,
          fontSize: '0.72rem',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          <span style={{ color: C.muted, fontWeight: 700 }}>Actual: </span>
          {pick.home_team} {pick.actual_home}–{pick.actual_away} {pick.away_team}
          <span style={{ color: C.muted, fontWeight: 600 }}>{pkLine}</span>
        </div>
      )}

      {/* Tiebreak / goalscorer footnotes */}
      {pick.if_draw_winner && (
        <div style={{
          color: C.muted,
          fontSize: '0.7rem',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>→ {pick.if_draw_winner} adv on PKs</div>
      )}
      {showGoalscorer && pick.goalscorer_name && (
        <div style={{
          color: C.muted,
          fontSize: '0.72rem',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.3rem',
          alignSelf: 'center',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ⚽ {pick.goalscorer_name}{pick.goalscorer_team ? ` (${pick.goalscorer_team})` : ''}
          </span>
          {showResult && (
            <span
              aria-label={scorerHit ? 'Goalscorer correct' : 'Goalscorer incorrect'}
              title={scorerHit ? 'Scored (+2)' : 'Did not score'}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: 800,
                fontSize: '0.75rem',
                lineHeight: 1,
                color: scorerHit ? '#00E676' : '#F87171',
                border: `1px solid ${scorerHit ? 'rgba(0,230,118,0.45)' : 'rgba(248,113,113,0.45)'}`,
                background: scorerHit ? 'rgba(0,230,118,0.12)' : 'rgba(248,113,113,0.10)',
                borderRadius: '0.25rem',
                padding: '1px 5px',
                flexShrink: 0,
              }}
            >
              {scorerHit ? '✓' : '✗'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Shared style export so callers can match the existing edit-btn pill. */
export const pickSummaryEditBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  background: 'rgba(251,191,36,0.08)',
  color: '#FBBF24',
  border: '1px solid rgba(251,191,36,0.3)',
  borderRadius: '0.4rem',
  padding: '0.25rem 0.55rem',
  fontSize: '0.7rem',
  fontWeight: 800,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
  lineHeight: 1.2,
}
