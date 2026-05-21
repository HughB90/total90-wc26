'use client'

/**
 * Shared leaderboard table for /predictor/leaderboard (global) and
 * /predictor/leagues/<code> (per-league).
 *
 * Layout:
 *   - Sticky top-3 rows pinned at the top (above the page rows)
 *   - 25 rows per page (configurable via page_size query)
 *   - Sticky "My row" pinned at the bottom of viewport
 *   - Horizontally scrollable per-round mini-cells; first two cols (Rank, Manager) frozen
 *   - Per-round mini-cells color-coded:
 *       teal  = exact (10 pts)
 *       green = result/winner (4 pts)
 *       red   = miss / no points
 *       grey  = no pick / future round
 *
 * Until the scoring engine populates predictor_scores, per-round cells only
 * show submission status (submitted/in-progress/none), not score colors.
 */

import { useEffect, useState } from 'react'
import { PREDICTOR_ROUNDS } from '@/lib/predictor-rounds'

const C = {
  card: '#0F1C4D',
  border: '#1E3A6E',
  borderSoft: '#162040',
  gold: '#FBBF24',
  green: '#00E676',
  teal: '#2DD4BF',
  red: '#F87171',
  muted: '#8899CC',
  text: '#F0F4FF',
  bg: '#0A0F2E',
}

type RoundStatus = 'submitted' | 'in-progress' | 'open' | 'locked' | 'none'

interface LbRow {
  rank: number
  profile_id: string
  first_name: string
  manager_name: string
  total_pts: number
  per_round: Record<string, number>
  winner_pick_pts: number
  round_status: Record<string, RoundStatus>
  is_me: boolean
}

interface LbResponse {
  rows: LbRow[]
  top3: LbRow[]
  my_row: LbRow | null
  page: number
  page_size: number
  total: number
  total_pages: number
  league?: { code: string; name: string; member_count: number } | null
}

interface Props {
  leagueCode?: string | null
  pageSize?: number
}

export default function PredictorLeaderboardTable({ leagueCode, pageSize = 25 }: Props) {
  const [data, setData] = useState<LbResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    const q = new URLSearchParams()
    if (leagueCode) q.set('league_code', leagueCode)
    q.set('page', String(page))
    q.set('page_size', String(pageSize))
    fetch(`/api/predictor/leaderboard?${q.toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok) { setErr(j?.error || 'leaderboard_failed'); setData(null); return }
        setData(j)
      })
      .catch(() => { if (!cancelled) setErr('network_error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leagueCode, page, pageSize])

  if (loading && !data) {
    return <div style={{ color: C.muted, padding: '2rem', textAlign: 'center' }}>Loading leaderboard…</div>
  }
  if (err) {
    return <div style={{ color: C.red, padding: '1rem', textAlign: 'center' }}>Couldn’t load leaderboard ({err}).</div>
  }
  if (!data || data.total === 0) {
    return (
      <div style={{ color: C.muted, padding: '2rem', textAlign: 'center', fontSize: '0.9rem' }}>
        No entries yet. Submit picks to appear on the board.
      </div>
    )
  }

  const top3 = data.top3 ?? []
  const myRow = data.my_row
  const rows = data.rows

  return (
    <div style={{ position: 'relative' }}>
      {/* Sticky top-3 */}
      {top3.length > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 5,
          backgroundColor: C.bg,
          paddingTop: '0.25rem', paddingBottom: '0.25rem',
          borderBottom: `2px solid ${C.gold}55`,
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <HeaderRow />
              </thead>
              <tbody>
                {top3.map((r) => <Row key={`top-${r.profile_id}`} row={r} highlight="top" />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page rows */}
      <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
        <table style={tableStyle}>
          <tbody>
            {rows.map((r) => (
              <Row key={r.profile_id} row={r} highlight={r.is_me ? 'me' : null} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        page={data.page}
        totalPages={data.total_pages}
        total={data.total}
        onPage={setPage}
      />

      {/* Sticky my-row at viewport bottom */}
      {myRow && !top3.some((r) => r.profile_id === myRow.profile_id) && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10,
          backgroundColor: C.bg,
          borderTop: `2px solid ${C.green}88`,
          padding: '0.4rem 0.75rem',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ overflowX: 'auto', maxWidth: 900, margin: '0 auto' }}>
            <table style={tableStyle}>
              <tbody>
                <Row row={myRow} highlight="me-sticky" />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontSize: '0.78rem',
  color: C.text,
  minWidth: 720,
}

function HeaderRow() {
  return (
    <tr style={{ backgroundColor: C.card }}>
      <th style={{ ...cellStyle, position: 'sticky', left: 0, backgroundColor: C.card, zIndex: 2, fontWeight: 700, color: C.gold, minWidth: 50 }}>#</th>
      <th style={{ ...cellStyle, position: 'sticky', left: 50, backgroundColor: C.card, zIndex: 2, fontWeight: 700, color: C.gold, minWidth: 180, textAlign: 'left' }}>Manager</th>
      <th style={{ ...cellStyle, fontWeight: 700, color: C.gold, minWidth: 110, textAlign: 'left' }}>First Name</th>
      <th style={{ ...cellStyle, fontWeight: 700, color: C.gold, minWidth: 60 }}>Total</th>
      {PREDICTOR_ROUNDS.map((r) => (
        <th key={r.code} style={{ ...cellStyle, fontWeight: 700, color: C.gold, minWidth: 42 }} title={r.label}>
          {r.shortLabel}
        </th>
      ))}
      <th style={{ ...cellStyle, fontWeight: 700, color: C.gold, minWidth: 50 }} title="Winner pick bonus">W</th>
    </tr>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '0.55rem 0.6rem',
  borderBottom: `1px solid ${C.borderSoft}`,
  textAlign: 'center',
  whiteSpace: 'nowrap',
}

function Row({ row, highlight }: { row: LbRow; highlight?: 'top' | 'me' | 'me-sticky' | null }) {
  const rowBg =
    highlight === 'top' ? 'rgba(251,191,36,0.07)' :
    highlight === 'me' ? 'rgba(0,230,118,0.10)' :
    highlight === 'me-sticky' ? 'rgba(0,230,118,0.15)' :
    'transparent'
  const stickyBg =
    highlight === 'top' ? '#1A2554' :
    highlight === 'me' || highlight === 'me-sticky' ? '#0E2C1B' :
    C.card

  return (
    <tr style={{ backgroundColor: rowBg }}>
      <td style={{ ...cellStyle, position: 'sticky', left: 0, backgroundColor: stickyBg, fontWeight: 700, color: highlight === 'top' ? C.gold : C.text, minWidth: 50 }}>
        {row.rank}
      </td>
      <td style={{ ...cellStyle, position: 'sticky', left: 50, backgroundColor: stickyBg, textAlign: 'left', fontWeight: 700, minWidth: 180 }}>
        {row.manager_name}
      </td>
      <td style={{ ...cellStyle, textAlign: 'left', color: C.muted, minWidth: 110 }}>
        {row.first_name}
      </td>
      <td style={{ ...cellStyle, fontWeight: 800, color: row.total_pts > 0 ? C.green : C.muted, minWidth: 60 }}>
        {row.total_pts}
      </td>
      {PREDICTOR_ROUNDS.map((r) => {
        const pts = row.per_round[r.code] ?? 0
        const status = row.round_status[r.code] ?? 'none'
        const { bg, fg } = roundCellStyle(pts, status)
        return (
          <td key={r.code} style={{ ...cellStyle, backgroundColor: bg, color: fg, fontWeight: 700, minWidth: 42 }}>
            {pts > 0 ? pts : (status === 'submitted' ? '·' : status === 'in-progress' ? '~' : '')}
          </td>
        )
      })}
      <td style={{ ...cellStyle, color: row.winner_pick_pts > 0 ? C.gold : C.muted, fontWeight: 700, minWidth: 50 }}>
        {row.winner_pick_pts || ''}
      </td>
    </tr>
  )
}

function roundCellStyle(pts: number, status: RoundStatus): { bg: string; fg: string } {
  // Post-scoring color tiers
  if (pts >= 10) return { bg: 'rgba(45,212,191,0.18)', fg: C.teal }
  if (pts > 0)   return { bg: 'rgba(0,230,118,0.14)',  fg: C.green }
  if (status === 'submitted')   return { bg: 'rgba(0,230,118,0.05)', fg: C.muted }
  if (status === 'in-progress') return { bg: 'rgba(251,191,36,0.08)', fg: C.gold }
  return { bg: 'transparent', fg: C.muted }
}

function Pagination({ page, totalPages, total, onPage }: {
  page: number; totalPages: number; total: number; onPage: (p: number) => void
}) {
  if (totalPages <= 1) {
    return <div style={{ color: C.muted, fontSize: '0.72rem', padding: '0.6rem 0', textAlign: 'center' }}>{total} {total === 1 ? 'entry' : 'entries'}</div>
  }
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 0 5rem' }}>
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} style={btnStyle(page <= 1)}>← Prev</button>
      <span style={{ color: C.muted, fontSize: '0.78rem' }}>Page {page} / {totalPages}</span>
      <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={btnStyle(page >= totalPages)}>Next →</button>
    </div>
  )
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    backgroundColor: disabled ? 'transparent' : C.card,
    border: `1px solid ${C.border}`,
    color: disabled ? C.muted : C.text,
    padding: '0.35rem 0.75rem',
    borderRadius: '0.5rem',
    fontSize: '0.78rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
  }
}
