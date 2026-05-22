/**
 * <PredictorTabBar /> — 4-tab bar for the `/predictor` home, mirroring
 * the visual style of `/predictor/leagues/[id]` (gold underline on
 * active tab, muted on inactive, scrolls horizontally on small viewports).
 *
 * Tab state lives in the parent (synced to `?tab=` query param).
 */

import type { CSSProperties } from 'react'

const C = {
  border: '#1E3A6E',
  gold: '#FBBF24',
  muted: '#8899CC',
}

export type PredictorTabId = 'leaderboard' | 'picks' | 'leagues' | 'scoring'

const TAB_LABELS: Record<PredictorTabId, string> = {
  leaderboard: 'Leaderboard',
  picks: 'Picks',
  leagues: 'Leagues',
  scoring: 'Scoring',
}

export const PREDICTOR_TAB_IDS: PredictorTabId[] = ['leaderboard', 'picks', 'leagues', 'scoring']

export function parseTab(raw: string | null | undefined): PredictorTabId {
  return PREDICTOR_TAB_IDS.includes(raw as PredictorTabId) ? (raw as PredictorTabId) : 'leaderboard'
}

export default function PredictorTabBar({
  active,
  onChange,
}: {
  active: PredictorTabId
  onChange: (tab: PredictorTabId) => void
}) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.3rem',
      borderBottom: `1px solid ${C.border}`,
      marginBottom: '1rem',
      overflowX: 'auto',
      // Hide native scrollbar on iOS to avoid the tab bar feeling clunky.
      scrollbarWidth: 'none',
      minWidth: 0,
    }}>
      {PREDICTOR_TAB_IDS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          style={tabBtnStyle(active === t)}
          aria-pressed={active === t}
        >{TAB_LABELS[t]}</button>
      ))}
    </div>
  )
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    background: 'none',
    border: 'none',
    color: active ? C.gold : C.muted,
    fontSize: '0.85rem',
    fontWeight: 700,
    padding: '0.6rem 0.95rem',
    cursor: 'pointer',
    borderBottom: `2px solid ${active ? C.gold : 'transparent'}`,
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    flexShrink: 0,
  }
}
