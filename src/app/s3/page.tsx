'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Player {
  id: string
  name: string
  nationality: string
  position: string
  s3_value: number
  age?: number
}

type SortKey = 't90' | 'age'
type PosFilter = 'All' | 'FWD' | 'MID' | 'DEF' | 'GK'

const posColors: Record<string, { bg: string; color: string }> = {
  FWD: { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
  MID: { bg: 'rgba(96,165,250,0.15)',  color: '#60A5FA' },
  DEF: { bg: 'rgba(0,230,118,0.15)',   color: '#00E676' },
  GK:  { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
}

const t90Tier = (score: number) => {
  if (score >= 100) return { label: '🟡 Elite', color: '#FFD700' }
  if (score >= 80)  return { label: '🟣 World Class', color: '#C084FC' }
  if (score >= 60)  return { label: '🔵 Top Tier', color: '#60A5FA' }
  if (score >= 40)  return { label: '🟢 Quality', color: '#00E676' }
  return { label: '⚪ Solid', color: '#8899CC' }
}

export default function S3Page() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('t90')
  const [posFilter, setPosFilter] = useState<PosFilter>('All')

  useEffect(() => {
    fetch('/api/s3/players')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPlayers(d) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = players
    .filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.nationality.toLowerCase().includes(search.toLowerCase())
      const matchPos = posFilter === 'All' || p.position === posFilter
      return matchSearch && matchPos
    })
    .sort((a, b) => sortKey === 't90' ? b.s3_value - a.s3_value : (a.age ?? 99) - (b.age ?? 99))

  return (
    <div style={{ backgroundColor: '#0A0F2E', minHeight: '100vh', color: '#F0F4FF', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #1E3A6E', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <img src="/total90-logo-green.png" alt="Total90" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
          <span style={{ color: '#00E676', fontWeight: 800, fontSize: '1rem' }}>TOTAL90</span>
          <span style={{ color: '#8899CC', fontSize: '0.8rem' }}>WC26</span>
        </Link>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          {[['News', '/news'], ['S³ Ratings', '/s3'], ['Bracket', '/bracket'], ['Scores', '/scores']].map(([label, href]) => (
            <Link key={href} href={href} style={{ color: href === '/s3' ? '#00E676' : '#8899CC', fontSize: '0.85rem', fontWeight: href === '/s3' ? 700 : 400, textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 900, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>
            📊 S³ Ratings
          </h1>
          <p style={{ color: '#8899CC', fontSize: '1rem', margin: '0 0 0.5rem' }}>
            Sign · Sell · Sack — Total90 player valuations for World Cup 2026
          </p>
          <p style={{ color: '#4A6080', fontSize: '0.8rem', margin: 0 }}>
            {players.length} players ranked · Voting coming soon
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search players or nations..."
            style={{ flex: 1, minWidth: '200px', backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.75rem', padding: '0.6rem 1rem', color: '#F0F4FF', fontSize: '0.875rem', outline: 'none' }}
          />
          {/* Position filter */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['All', 'FWD', 'MID', 'DEF', 'GK'] as PosFilter[]).map(p => (
              <button key={p} onClick={() => setPosFilter(p)} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.625rem', border: '1px solid', borderColor: posFilter === p ? '#00E676' : '#1E3A6E', backgroundColor: posFilter === p ? 'rgba(0,230,118,0.1)' : 'transparent', color: posFilter === p ? '#00E676' : '#8899CC', cursor: 'pointer', fontSize: '0.78rem', fontWeight: posFilter === p ? 700 : 400, fontFamily: 'inherit' }}>{p}</button>
            ))}
          </div>
          {/* Sort */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[['t90', 'By T90'], ['age', 'By Age']] .map(([k, label]) => (
              <button key={k} onClick={() => setSortKey(k as SortKey)} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.625rem', border: '1px solid', borderColor: sortKey === k ? '#FBBF24' : '#1E3A6E', backgroundColor: sortKey === k ? 'rgba(251,191,36,0.1)' : 'transparent', color: sortKey === k ? '#FBBF24' : '#8899CC', cursor: 'pointer', fontSize: '0.78rem', fontWeight: sortKey === k ? 700 : 400, fontFamily: 'inherit' }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Player list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8899CC' }}>Loading {638} players...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8899CC' }}>No players found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {filtered.map((p, idx) => {
              const tier = t90Tier(p.s3_value)
              const posStyle = posColors[p.position] || posColors.MID
              const globalRank = players.indexOf(p) + 1
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.875rem', padding: '0.75rem 1.25rem' }}>
                  {/* Rank */}
                  <span style={{ color: '#4A6080', fontSize: '0.8rem', fontWeight: 700, width: '28px', flexShrink: 0, textAlign: 'right' }}>#{globalRank}</span>

                  {/* Name + nationality */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#F0F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ color: '#8899CC', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                      {p.nationality}{p.age ? ` · Age ${p.age}` : ''}
                    </div>
                  </div>

                  {/* Position badge */}
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '0.4rem', backgroundColor: posStyle.bg, color: posStyle.color, flexShrink: 0 }}>{p.position}</span>

                  {/* T90 + tier */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: tier.color, fontWeight: 800, fontSize: '1rem' }}>{p.s3_value}</div>
                    <div style={{ color: '#4A6080', fontSize: '0.65rem' }}>{tier.label.split(' ').slice(1).join(' ')}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
