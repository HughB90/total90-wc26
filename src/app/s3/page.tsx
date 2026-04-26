'use client'

import { useEffect, useState } from 'react'

interface Player {
  id: string
  name: string
  short_name?: string
  nationality: string
  position: string
  s3_value: number
  age?: number
  photo_url?: string
  opta_id?: string
}

type SortKey = 't90' | 'age'
type PosFilter = 'All' | 'FWD' | 'MID' | 'DEF' | 'GK'
type PageSize = 25 | 50 | 100

const posColors: Record<string, { bg: string; color: string }> = {
  FWD: { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  MID: { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA' },
  DEF: { bg: 'rgba(0,230,118,0.15)',  color: '#00E676' },
  GK:  { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
}

const t90Tier = (score: number) => {
  if (score >= 100) return { label: 'Elite',       color: '#FFD700' }
  if (score >= 80)  return { label: 'World Class', color: '#C084FC' }
  if (score >= 60)  return { label: 'Top Tier',    color: '#60A5FA' }
  if (score >= 40)  return { label: 'Quality',     color: '#00E676' }
  return              { label: 'Solid',        color: '#8899CC' }
}

export default function S3Page() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('t90')
  const [posFilter, setPosFilter] = useState<PosFilter>('All')
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch('/api/s3/players')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPlayers(d) })
      .finally(() => setLoading(false))
  }, [])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, posFilter, sortKey, pageSize])

  const filtered = players
    .filter(p => {
      const q = search.toLowerCase()
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.nationality.toLowerCase().includes(q)
      const matchPos = posFilter === 'All' || p.position === posFilter
      return matchSearch && matchPos
    })
    .sort((a, b) => sortKey === 't90' ? b.s3_value - a.s3_value : (a.age ?? 99) - (b.age ?? 99))

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const startRank = (page - 1) * pageSize + 1

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1.5rem 2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 900, margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>
          📊 S³ Ratings
        </h1>
        <p style={{ color: '#8899CC', fontSize: '0.95rem', margin: '0 0 0.3rem' }}>
          Sign · Sell · Sack — Total90 player valuations for World Cup 2026
        </p>
        <p style={{ color: '#4A6080', fontSize: '0.78rem', margin: 0 }}>
          {players.length} players ranked · Voting coming soon
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search players or nations..."
          style={{ flex: 1, minWidth: '180px', backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.75rem', padding: '0.55rem 1rem', color: '#F0F4FF', fontSize: '0.875rem', outline: 'none' }}
        />
        {/* Position filter */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {(['All', 'FWD', 'MID', 'DEF', 'GK'] as PosFilter[]).map(p => (
            <button key={p} onClick={() => setPosFilter(p)} style={{ padding: '0.4rem 0.7rem', borderRadius: '0.5rem', border: '1px solid', borderColor: posFilter === p ? '#00E676' : '#1E3A6E', backgroundColor: posFilter === p ? 'rgba(0,230,118,0.1)' : 'transparent', color: posFilter === p ? '#00E676' : '#8899CC', cursor: 'pointer', fontSize: '0.75rem', fontWeight: posFilter === p ? 700 : 400, fontFamily: 'inherit' }}>{p}</button>
          ))}
        </div>
        {/* Sort */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {([['t90', 'T90'], ['age', 'Age']] as [SortKey, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSortKey(k)} style={{ padding: '0.4rem 0.7rem', borderRadius: '0.5rem', border: '1px solid', borderColor: sortKey === k ? '#FBBF24' : '#1E3A6E', backgroundColor: sortKey === k ? 'rgba(251,191,36,0.08)' : 'transparent', color: sortKey === k ? '#FBBF24' : '#8899CC', cursor: 'pointer', fontSize: '0.75rem', fontWeight: sortKey === k ? 700 : 400, fontFamily: 'inherit' }}>{label}</button>
          ))}
        </div>

      </div>

      {/* Results count + pagination + per-page */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span style={{ color: '#4A6080', fontSize: '0.75rem' }}>
            #{startRank}–#{Math.min(startRank + pageSize - 1, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.5rem', border: '1px solid #1E3A6E', backgroundColor: 'transparent', color: page === 1 ? '#1E3A6E' : '#8899CC', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>← Prev</button>
            <span style={{ color: '#8899CC', fontSize: '0.75rem', minWidth: '65px', textAlign: 'center' }}>Page {page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.5rem', border: '1px solid #1E3A6E', backgroundColor: 'transparent', color: page === totalPages ? '#1E3A6E' : '#8899CC', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>Next →</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: '#4A6080', fontSize: '0.7rem' }}>Per page:</span>
          {([25, 50, 100] as PageSize[]).map(n => (
            <button key={n} onClick={() => setPageSize(n)} style={{ padding: '0.2rem 0.55rem', borderRadius: '0.4rem', border: '1px solid', borderColor: pageSize === n ? '#8899CC' : '#1E3A6E', backgroundColor: pageSize === n ? 'rgba(136,153,204,0.1)' : 'transparent', color: pageSize === n ? '#F0F4FF' : '#4A6080', cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit' }}>{n}</button>
          ))}
        </div>
      </div>

      {/* Player list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#8899CC' }}>Loading players...</div>
      ) : paginated.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#8899CC' }}>No players found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {paginated.map((p) => {
            const globalRank = filtered.indexOf(p) + 1
            const tier = t90Tier(p.s3_value)
            const posStyle = posColors[p.position] || posColors.MID
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.75rem', padding: '0.5rem 1rem' }}>
                <span style={{ color: '#4A6080', fontSize: '0.7rem', fontWeight: 700, width: '28px', flexShrink: 0, textAlign: 'right' }}>#{globalRank}</span>
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.short_name || p.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #1E3A6E', backgroundColor: '#162040' }} />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#162040', border: '1px solid #1E3A6E', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A6080', fontSize: '0.7rem', fontWeight: 700 }}>{(p.short_name || p.name).charAt(0)}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#F0F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.short_name || p.name}</div>
                  <div style={{ color: '#8899CC', fontSize: '0.7rem', marginTop: '0.1rem' }}>{p.nationality}{p.age ? ` · Age ${p.age}` : ''}</div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: '0.4rem', backgroundColor: posStyle.bg, color: posStyle.color, flexShrink: 0 }}>{p.position}</span>
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '60px' }}>
                  <div style={{ color: tier.color, fontWeight: 800, fontSize: '0.95rem' }}>{p.s3_value}</div>
                  <div style={{ color: '#4A6080', fontSize: '0.62rem' }}>{tier.label}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginTop: '1.5rem' }}>
          <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #1E3A6E', backgroundColor: 'transparent', color: page === 1 ? '#1E3A6E' : '#8899CC', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>« First</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #1E3A6E', backgroundColor: 'transparent', color: page === 1 ? '#1E3A6E' : '#8899CC', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>← Prev</button>
          <span style={{ padding: '0.4rem 1rem', color: '#8899CC', fontSize: '0.78rem' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #1E3A6E', backgroundColor: 'transparent', color: page === totalPages ? '#1E3A6E' : '#8899CC', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>Next →</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #1E3A6E', backgroundColor: 'transparent', color: page === totalPages ? '#1E3A6E' : '#8899CC', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>Last »</button>
        </div>
      )}
    </div>
  )
}
