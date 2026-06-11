/**
 * <GlobalLeaderboardPill /> — paginated 25/page global leaderboard.
 *
 * Fans out to two endpoints in parallel:
 *   - /api/predictor/leaderboard          (edge-cached public rows)
 *   - /api/predictor/leaderboard/me       (uncached caller rank)
 *
 * Cached endpoint returns fast even when 100+ users hit it at once;
 * the /me call is a small DB lookup per request. Merged client-side
 * so the sticky "You: #N" row still renders the same way.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
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

const PER_PAGE = 25

interface LeaderboardRow {
  rank: number
  profile_id: string
  manager_name: string
  first_name: string
  last_name: string
  total: number
}

interface LeaderboardResponse {
  rows: LeaderboardRow[]
  page: number
  per_page: number
  total_count: number
  // The public endpoint always returns these as null; the /me endpoint
  // fills them in. We merge after both fetches resolve.
  my_rank: number | null
  my_row: LeaderboardRow | null
}

interface LeaderboardMeResponse {
  my_rank: number | null
  my_row: LeaderboardRow | null
}

export default function GlobalLeaderboardPill({ meId }: { meId: string | null }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // Public + /me fetched in parallel. Public is edge-cached so
        // it returns ~instantly during live polling; /me is cheap.
        const [publicRes, meRes] = await Promise.all([
          fetch(
            `/api/predictor/leaderboard?scope=global&page=${page}&per_page=${PER_PAGE}`,
            { credentials: 'include' }
          ),
          fetch(`/api/predictor/leaderboard/me?scope=global`, {
            credentials: 'include',
            cache: 'no-store',
          }),
        ])
        const publicJson = (await publicRes.json().catch(() => null)) as LeaderboardResponse | null
        const meJson = (await meRes.json().catch(() => null)) as LeaderboardMeResponse | null
        if (!cancelled) {
          const merged: LeaderboardResponse | null = publicJson
            ? {
                ...publicJson,
                my_rank: meJson?.my_rank ?? null,
                my_row: meJson?.my_row ?? null,
              }
            : null
          setData(merged)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [page])

  const totalPages = useMemo(() => {
    if (!data || data.total_count === 0) return 1
    return Math.max(1, Math.ceil(data.total_count / data.per_page))
  }, [data])

  const rows = data?.rows ?? []
  const myRank = data?.my_rank ?? null
  const myRow = data?.my_row ?? null
  const myRowOnPage = myRow ? rows.some((r) => r.profile_id === myRow.profile_id) : false
  const showStickyMyRow = Boolean(myRow && !myRowOnPage)

  return (
    <div style={cardOuter}>
      <div style={cardHeader}>
        <span>Best Teams in the World</span>
        <span style={{ color: C.muted, fontSize: '0.7rem' }}>
          {data ? `${data.total_count} player${data.total_count === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {/* Sticky "You: #N" row when off-page */}
      {showStickyMyRow && myRow && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.5rem 0.6rem',
          backgroundColor: 'rgba(251,191,36,0.12)',
          border: '1px solid rgba(251,191,36,0.4)',
          borderRadius: '0.45rem',
          display: 'grid',
          gridTemplateColumns: '36px 1fr 60px',
          alignItems: 'center',
          gap: '0.5rem',
          minWidth: 0,
        }}>
          <span style={{ color: C.gold, fontSize: '0.72rem', fontWeight: 800 }}>#{myRow.rank}</span>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{
              color: C.gold,
              fontSize: '0.82rem',
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>You — {myRow.manager_name}</div>
          </div>
          <span style={{ color: C.gold, fontSize: '0.82rem', fontWeight: 800, textAlign: 'right' }}>{myRow.total}</span>
        </div>
      )}

      {loading && !data ? (
        <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0.6rem 0 0' }}>Loading leaderboard…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0.6rem 0 0', lineHeight: 1.4 }}>
          Nobody's submitted picks yet. Be first.
        </p>
      ) : (
        <>
          {/* Column header */}
          <div style={{
            marginTop: '0.6rem',
            display: 'grid',
            gridTemplateColumns: '36px 1fr 60px',
            gap: '0.5rem',
            padding: '0 0.55rem',
            color: C.muted,
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            minWidth: 0,
          }}>
            <span>#</span>
            <span>Manager</span>
            <span style={{ textAlign: 'right' }}>Total</span>
          </div>

          <div style={{ display: 'grid', gap: '0.3rem', marginTop: '0.35rem' }}>
            {rows.map((row) => {
              const isMe = meId !== null && row.profile_id === meId
              return (
                <div key={row.profile_id} style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 60px',
                  gap: '0.5rem',
                  padding: '0.45rem 0.55rem',
                  backgroundColor: isMe ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isMe ? 'rgba(251,191,36,0.3)' : C.borderSoft}`,
                  borderRadius: '0.4rem',
                  alignItems: 'center',
                  minWidth: 0,
                }}>
                  <span style={{ color: C.muted, fontSize: '0.72rem', fontWeight: 700 }}>#{row.rank}</span>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{
                      color: isMe ? C.gold : C.text,
                      fontSize: '0.82rem',
                      fontWeight: isMe ? 800 : 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {row.manager_name}
                      {isMe && <span style={{ color: C.gold, fontWeight: 700 }}> ← You</span>}
                    </div>
                    {(() => {
                      const sub = profileFullName(row.first_name, row.last_name, row.manager_name)
                      return sub ? (
                        <div style={{
                          color: C.muted,
                          fontSize: '0.7rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{sub}</div>
                      ) : null
                    })()}
                  </div>
                  <span style={{ color: C.gold, fontSize: '0.82rem', fontWeight: 800, textAlign: 'right' }}>{row.total}</span>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              myRank={myRank}
              perPage={PER_PAGE}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  )
}

function Pagination({
  page, totalPages, myRank, perPage, onChange,
}: {
  page: number
  totalPages: number
  myRank: number | null
  perPage: number
  onChange: (p: number) => void
}) {
  // Compact pager: prev | first | ... | active range | ... | last | next
  // Plus a "Jump to me" button when myRank is on another page.
  const myPage = myRank ? Math.ceil(myRank / perPage) : null
  const visible = pageWindow(page, totalPages)

  return (
    <div style={{
      marginTop: '0.7rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.4rem',
      flexWrap: 'wrap',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', minWidth: 0 }}>
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} style={pageBtn(page > 1)}>← Prev</button>
        {visible.map((p, idx) =>
          p === '…' ? (
            <span key={`g${idx}`} style={{ color: C.muted, padding: '0 0.3rem', fontSize: '0.75rem' }}>…</span>
          ) : (
            <button key={p} onClick={() => onChange(p)} style={pageBtn(p !== page, p === page)}>{p}</button>
          )
        )}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={pageBtn(page < totalPages)}>Next →</button>
      </div>
      {myPage && myPage !== page && (
        <button onClick={() => onChange(myPage)} style={{
          background: 'rgba(251,191,36,0.08)',
          color: C.gold,
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: '0.4rem',
          padding: '0.3rem 0.55rem',
          fontSize: '0.72rem',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}>Jump to me</button>
      )}
    </div>
  )
}

function pageWindow(page: number, totalPages: number): (number | '…')[] {
  // Show up to ~7 items: first, current ±1, last, with ellipses.
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1])
  const sorted = Array.from(set).filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…')
    out.push(sorted[i])
  }
  return out
}

function pageBtn(enabled: boolean, active = false): CSSProperties {
  return {
    background: active ? C.gold : 'transparent',
    color: active ? '#0A0F2E' : (enabled ? C.text : C.muted),
    border: `1px solid ${active ? C.gold : C.border}`,
    borderRadius: '0.35rem',
    padding: '0.28rem 0.55rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    minWidth: 32,
  }
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
