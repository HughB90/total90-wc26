'use client'

/**
 * <KnockoutRoundPanel /> — one knockout round (R32/R16/QF/SF/Final) rendered
 * as a column of match cards. Used inside the horizontal carousel at
 * /predictor/knockout.
 *
 * Mirrors the per-match UI from /predictor/round/[round_code] but with two
 * key behaviors layered on top:
 *
 *   1. **Cascade projection.** Team codes like `"Winner M73"` are remapped
 *      to the projected team name from upstream picks/results. The raw code
 *      is still used internally for `if_draw_winner` / persistence so the
 *      server validation passes.
 *
 *   2. **No goalscorer UI.** That feature is owned by the existing
 *      /predictor/round/[code] page and stays there. The carousel is for
 *      knockout bracket picks (scoreline + draw advancer + star on R32).
 *      A small link sends users to the per-round page to manage scorers.
 */

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { flagUrl } from '@/lib/predictor-flags'
import { parsePlaceholder, projectTeamName } from '@/lib/predictor/cascade'
import type { CascadeMatch } from '@/lib/predictor/cascade'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
  red: '#F87171',
  teal: '#22D3EE',
}

const OUTCOME_BORDER: Record<'teal' | 'green' | 'red' | 'gray', string> = {
  teal: '#22D3EE', green: '#00E676', red: '#F87171', gray: '#2a3550',
}
const OUTCOME_BG: Record<'teal' | 'green' | 'red' | 'gray', string> = {
  teal: 'rgba(34,211,238,0.10)',
  green: 'rgba(0,230,118,0.08)',
  red: 'rgba(248,113,113,0.07)',
  gray: 'rgba(136,153,204,0.05)',
}

export interface PickState {
  home: string
  away: string
  is_star: boolean
  if_draw_winner: string | null
  dirty: boolean
}

interface ScoreBreakdown {
  exact_pts: number
  result_pts: number
  scorer_pts: number
  star_multiplier: number
  total_pts: number
  outcome_color: 'teal' | 'green' | 'red' | 'gray'
}

interface PanelProps {
  roundCode: string
  roundLabel: string
  matches: CascadeMatch[]
  picks: Record<string, PickState>
  scores: Record<string, ScoreBreakdown>
  matchLockedById: Record<string, boolean>
  cascade: Map<number, { winner: string | null; loser: string | null }>
  hasStars: boolean
  hasGoalscorer: boolean
  starCount: number
  expectedPicks: number
  filledCount: number
  drawNeedsWinner: boolean
  onChange: (matchId: string, patch: Partial<PickState>) => void
  onClear: (matchId: string) => void
  clearing: Set<string>
}

export default function KnockoutRoundPanel({
  roundCode, roundLabel, matches, picks, scores, matchLockedById, cascade,
  hasStars, hasGoalscorer, starCount, expectedPicks, filledCount,
  drawNeedsWinner, onChange, onClear, clearing,
}: PanelProps) {
  const tooManyStars = hasStars && starCount > 1
  const knockoutShort = filledCount !== expectedPicks

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ marginBottom: '0.85rem' }}>
        <h2 style={{
          fontSize: '1.1rem',
          fontWeight: 900,
          color: C.gold,
          margin: '0 0 0.2rem',
          textAlign: 'center',
        }}>{roundLabel}</h2>
        <div style={{
          color: C.muted,
          fontSize: '0.72rem',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          <span>
            Picks <span style={{ color: knockoutShort ? C.red : C.green, fontWeight: 800 }}>{filledCount}/{expectedPicks}</span>
          </span>
          {hasStars && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>Stars <span style={{ color: tooManyStars ? C.red : C.green, fontWeight: 800 }}>{starCount}/1</span></span>
            </>
          )}
          {drawNeedsWinner && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ color: C.red, fontWeight: 800 }}>Choose draw advancer</span>
            </>
          )}
        </div>
        {hasGoalscorer && (
          <p style={{
            margin: '0.45rem 0 0',
            textAlign: 'center',
            color: C.muted,
            fontSize: '0.7rem',
          }}>
            Anytime Goalscorer picks (+2 pts) live on the{' '}
            <Link href={`/predictor/round/${roundCode}`} style={{ color: C.gold, textDecoration: 'underline' }}>
              {roundLabel.split(' — ')[0]} page
            </Link>.
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {matches.length === 0 && (
          <div style={{ color: C.muted, textAlign: 'center', padding: '2rem 0' }}>Loading…</div>
        )}
        {matches.map((mt) => {
          const pick = picks[mt.id] || {
            home: '', away: '', is_star: false, if_draw_winner: null, dirty: false,
          }
          const isDraw = pick.home !== '' && pick.home === pick.away
          const drawNeedsPick = isDraw && !pick.if_draw_winner
          const matchLocked = matchLockedById[mt.id] === true
          const score = scores[mt.id] || null

          // Cascade-projected display names (fall back to raw placeholder).
          const homeDisplay = projectTeamName(mt.home_team_code, cascade)
          const awayDisplay = projectTeamName(mt.away_team_code, cascade)

          return (
            <KnockoutMatchCard
              key={mt.id}
              match={mt}
              pick={pick}
              score={score}
              hasStars={hasStars}
              matchLocked={matchLocked}
              drawNeedsPick={drawNeedsPick}
              homeDisplay={homeDisplay}
              awayDisplay={awayDisplay}
              clearable={!matchLocked && pick.home !== '' && pick.away !== ''}
              clearing={clearing.has(mt.id)}
              onChange={(patch) => onChange(mt.id, patch)}
              onClear={() => onClear(mt.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

interface CardProps {
  match: CascadeMatch
  pick: PickState
  score: ScoreBreakdown | null
  hasStars: boolean
  matchLocked: boolean
  drawNeedsPick: boolean
  homeDisplay: string
  awayDisplay: string
  clearable: boolean
  clearing: boolean
  onChange: (patch: Partial<PickState>) => void
  onClear: () => void
}

function KnockoutMatchCard({
  match, pick, score, hasStars, matchLocked, drawNeedsPick,
  homeDisplay, awayDisplay, clearable, clearing, onChange, onClear,
}: CardProps) {
  const isDraw = pick.home !== '' && pick.home === pick.away
  const koDate = new Date(match.kickoff_at)
  const dateStr = isFinite(koDate.getTime())
    ? koDate.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''

  const isFinalized = match.home_score !== null && match.away_score !== null
  const hasPick = pick.home !== '' && pick.away !== ''
  const outcome: 'teal' | 'green' | 'red' | 'gray' = isFinalized
    ? (score?.outcome_color ?? (hasPick ? 'red' : 'gray'))
    : 'gray'
  const showResult = isFinalized
  const borderColor = showResult
    ? OUTCOME_BORDER[outcome]
    : (matchLocked ? '#2a3550' : (pick.is_star ? '#FBBF2466' : (drawNeedsPick ? '#F8717166' : C.borderSoft)))
  const bgColor = showResult
    ? OUTCOME_BG[outcome]
    : (matchLocked ? 'rgba(15, 28, 77, 0.55)' : C.card)

  return (
    <div
      title={matchLocked ? 'Locked at kickoff' : undefined}
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderLeft: showResult ? `4px solid ${OUTCOME_BORDER[outcome]}` : `1px solid ${borderColor}`,
        borderRadius: '0.75rem',
        padding: '0.85rem 0.75rem',
        minWidth: 0,
        overflow: 'hidden',
        opacity: matchLocked && !showResult ? 0.55 : 1,
        transition: 'opacity 120ms ease, background-color 200ms ease, border-color 200ms ease',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.5rem', fontSize: '0.7rem', color: C.muted,
      }}>
        <span>
          Match {match.match_num}{dateStr ? ` · ${dateStr} CT` : ''}
          {matchLocked && !showResult && <span style={{ marginLeft: '0.5rem', color: C.muted, fontWeight: 800 }}>· LOCKED</span>}
          {showResult && <span style={{ marginLeft: '0.5rem', color: OUTCOME_BORDER[outcome], fontWeight: 800 }}>· FINAL</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {clearable && (
            <button
              type="button"
              onClick={() => !clearing && onClear()}
              disabled={clearing}
              title="Drop this pick"
              style={{
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: '0.35rem',
                color: '#F87171',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: clearing ? 'default' : 'pointer',
                padding: '0.15rem 0.45rem',
                opacity: clearing ? 0.6 : 1,
              }}
            >{clearing ? '…' : '✕'}</button>
          )}
          {hasStars && (
            <button
              type="button"
              onClick={() => !matchLocked && onChange({ is_star: !pick.is_star })}
              disabled={matchLocked}
              style={{
                background: 'none',
                border: 'none',
                cursor: matchLocked ? 'default' : 'pointer',
                color: pick.is_star ? C.gold : '#2a3550',
                fontSize: '1.15rem',
                padding: 0,
              }}
              aria-label="Toggle star"
            >★</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
        <TeamSide team={homeDisplay} isPlaceholder={!isResolved(homeDisplay, match.home_team_code)} align="right" />
        <ScoreInput value={pick.home} onChange={(v) => !matchLocked && onChange({ home: v })} disabled={matchLocked} />
        <span style={{ color: C.muted, fontSize: '0.85rem', flexShrink: 0 }}>–</span>
        <ScoreInput value={pick.away} onChange={(v) => !matchLocked && onChange({ away: v })} disabled={matchLocked} />
        <TeamSide team={awayDisplay} isPlaceholder={!isResolved(awayDisplay, match.away_team_code)} align="left" />
      </div>

      {/* Draw advancer chooser (knockouts only). NOTE: the underlying value
          stored in `if_draw_winner` is the RAW team_code from the match row
          (could be a placeholder like "Winner M75"). The buttons display the
          cascade-projected name but persist the raw code so server validation
          accepts it. */}
      {isDraw && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.5rem 0.7rem',
          borderRadius: '0.4rem',
          backgroundColor: 'rgba(248,113,113,0.06)',
          border: `1px solid ${pick.if_draw_winner ? '#2a3550' : '#F8717155'}`,
        }}>
          <div style={{ color: C.muted, fontSize: '0.72rem', marginBottom: '0.4rem', fontWeight: 700 }}>
            If draw at 90, who advances?
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[
              { raw: match.home_team_code, label: homeDisplay },
              { raw: match.away_team_code, label: awayDisplay },
            ].map(({ raw, label }) => (
              <button
                key={raw}
                type="button"
                onClick={() => !matchLocked && onChange({ if_draw_winner: raw })}
                disabled={matchLocked}
                style={{
                  flex: 1,
                  backgroundColor: pick.if_draw_winner === raw ? 'rgba(0,230,118,0.15)' : '#0A0F2E',
                  border: `1px solid ${pick.if_draw_winner === raw ? C.green : C.borderSoft}`,
                  borderRadius: '0.35rem',
                  padding: '0.35rem',
                  color: C.text,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: matchLocked ? 'default' : 'pointer',
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      )}

      {showResult && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.5rem 0.7rem',
          borderRadius: '0.4rem',
          backgroundColor: 'rgba(10,15,46,0.55)',
          border: `1px solid ${OUTCOME_BORDER[outcome]}33`,
          fontSize: '0.78rem',
          color: C.text,
          fontWeight: 700,
        }}>
          Actual: {match.home_team_code} {match.home_score}–{match.away_score} {match.away_team_code}
          {match.went_to_pks && match.pk_winner_team_code && (
            <span style={{ color: C.muted, fontWeight: 600 }}> · PKs: {match.pk_winner_team_code}</span>
          )}
          {score && (
            <span style={{ marginLeft: '0.5rem', color: OUTCOME_BORDER[outcome], fontWeight: 800 }}>
              {score.total_pts > 0 ? `+${score.total_pts}` : score.total_pts} pts
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function isResolved(displayName: string, rawCode: string): boolean {
  // It's "resolved" (real team) when the displayed name differs from the
  // raw placeholder ("Brazil" vs "Winner M74"), or when there's no
  // placeholder to begin with.
  return parsePlaceholder(rawCode) === null || displayName !== rawCode
}

function TeamSide({ team, isPlaceholder, align }: { team: string; isPlaceholder: boolean; align: 'left' | 'right' }) {
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      gap: '0.4rem',
      overflow: 'hidden',
    }}>
      {align === 'right' && (
        <span style={{
          color: isPlaceholder ? '#8899CC' : '#F0F4FF',
          fontStyle: isPlaceholder ? 'italic' : 'normal',
          fontSize: '0.82rem',
          fontWeight: 600,
          textAlign: 'right',
          minWidth: 0,
          flex: '0 1 auto',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{team}</span>
      )}
      {!isPlaceholder && (
        <img
          src={flagUrl(team)}
          alt=""
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          style={{ width: 20, height: 13, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
        />
      )}
      {align === 'left' && (
        <span style={{
          color: isPlaceholder ? '#8899CC' : '#F0F4FF',
          fontStyle: isPlaceholder ? 'italic' : 'normal',
          fontSize: '0.82rem',
          fontWeight: 600,
          minWidth: 0,
          flex: '0 1 auto',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{team}</span>
      )}
    </div>
  )
}

function ScoreInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const inputStyle: CSSProperties = {
    width: 40,
    textAlign: 'center',
    padding: '0.4rem 0.2rem',
    borderRadius: '0.35rem',
    border: `1px solid ${C.border}`,
    backgroundColor: '#0A0F2E',
    color: C.text,
    fontSize: '0.95rem',
    fontWeight: 700,
    appearance: 'textfield',
    MozAppearance: 'textfield',
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={15}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange('')
        const n = parseInt(raw, 10)
        if (Number.isNaN(n) || n < 0) return
        if (n > 15) return onChange('15')
        onChange(String(n))
      }}
      style={inputStyle}
    />
  )
}
