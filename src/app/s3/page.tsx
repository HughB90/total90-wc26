'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Player {
  id: string
  name: string
  team: string
  position: string
  elo_score: number
  sign_count: number
  sell_count: number
  sack_count: number
}

type VoteType = 'sign' | 'sell' | 'sack'
type SortKey = 'elo' | 'sign' | 'sack'
type PositionFilter = 'ALL' | 'FWD' | 'MID' | 'DEF' | 'GK'

const positionColors: Record<string, { bg: string; color: string }> = {
  FWD: { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  MID: { bg: 'rgba(0,230,118,0.15)',  color: '#00E676' },
  DEF: { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA' },
  GK:  { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
}

function getFingerprint(): string {
  const key = 's3_fp'
  if (typeof window === 'undefined') return 'server'
  let fp = localStorage.getItem(key)
  if (!fp) {
    fp = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(key, fp)
  }
  return fp
}

function getVoted(playerId: string): VoteType | null {
  if (typeof window === 'undefined') return null
  return (localStorage.getItem(`s3_voted_${playerId}`) as VoteType) || null
}

function setVoted(playerId: string, vote: VoteType) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`s3_voted_${playerId}`, vote)
  }
}

export default function S3Page() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [votedMap, setVotedMap] = useState<Record<string, VoteType>>({})
  const [voting, setVoting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('elo')
  const [posFilter, setPosFilter] = useState<PositionFilter>('ALL')

  const loadPlayers = async () => {
    try {
      const res = await fetch('/api/s3/players')
      const data = await res.json()
      if (Array.isArray(data)) {
        setPlayers(data)
        // Load local votes
        const map: Record<string, VoteType> = {}
        for (const p of data) {
          const v = getVoted(p.id)
          if (v) map[p.id] = v
        }
        setVotedMap(map)
      }
    } catch {
      // silent
    }
    setLoading(false)
  }

  useEffect(() => { loadPlayers() }, [])

  const handleVote = async (playerId: string, vote: VoteType) => {
    if (voting) return
    if (votedMap[playerId]) return
    setVoting(playerId)
    try {
      const fp = getFingerprint()
      const res = await fetch('/api/s3/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, vote, voterFingerprint: fp }),
      })
      const data = await res.json()
      if (data.ok) {
        setVoted(playerId, vote)
        setVotedMap(prev => ({ ...prev, [playerId]: vote }))
        setPlayers(prev => prev.map(p => {
          if (p.id !== playerId) return p
          return {
            ...p,
            elo_score: data.newElo ?? p.elo_score,
            sign_count: vote === 'sign' ? p.sign_count + 1 : p.sign_count,
            sell_count: vote === 'sell' ? p.sell_count + 1 : p.sell_count,
            sack_count: vote === 'sack' ? p.sack_count + 1 : p.sack_count,
          }
        }))
      }
    } catch {
      // silent
    }
    setVoting(null)
  }

  const sorted = [...players].sort((a, b) => {
    if (sortKey === 'elo') return b.elo_score - a.elo_score
    if (sortKey === 'sign') {
      const ta = a.sign_count + a.sell_count + a.sack_count
      const tb = b.sign_count + b.sell_count + b.sack_count
      const pctA = ta > 0 ? a.sign_count / ta : 0
      const pctB = tb > 0 ? b.sign_count / tb : 0
      return pctB - pctA
    }
    // sack
    const ta = a.sign_count + a.sell_count + a.sack_count
    const tb = b.sign_count + b.sell_count + b.sack_count
    const pctA = ta > 0 ? a.sack_count / ta : 0
    const pctB = tb > 0 ? b.sack_count / tb : 0
    return pctB - pctA
  })

  const filtered = sorted.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.team.toLowerCase().includes(search.toLowerCase())
    const matchPos = posFilter === 'ALL' || p.position === posFilter
    return matchSearch && matchPos
  })

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.35rem 0.85rem',
    borderRadius: '2rem',
    border: `1px solid ${active ? '#00E676' : '#1E3A6E'}`,
    backgroundColor: active ? 'rgba(0,230,118,0.12)' : 'transparent',
    color: active ? '#00E676' : '#8899CC',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? 'rgba(0,230,118,0.12)' : 'transparent',
  })

  return (
    <div style={{ backgroundColor: '#0A0F2E', minHeight: '100vh', color: '#F0F4FF', fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <nav style={{ borderBottom: '1px solid #1E3A6E', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: '1100px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#00E676', fontWeight: 800, textDecoration: 'none', fontSize: '1rem' }}>
          TOTAL90 <span style={{ color: '#FBBF24' }}>WC26</span>
        </Link>
        <span style={{ color: '#4A6080' }}>/</span>
        <span style={{ color: '#8899CC', fontSize: '0.9rem' }}>S³ Ratings</span>
      </nav>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.35rem' }}>📊 S³ Ratings — Sign · Sell · Sack</h1>
          <p style={{ color: '#8899CC', fontSize: '0.875rem', margin: 0 }}>
            How does the world rate World Cup 2026 players? Vote on each player&apos;s value.
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search players or teams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              backgroundColor: '#0F1C4D',
              border: '1px solid #1E3A6E',
              borderRadius: '0.75rem',
              padding: '0.5rem 1rem',
              color: '#F0F4FF',
              fontSize: '0.875rem',
              outline: 'none',
              minWidth: '200px',
              flex: 1,
            }}
          />
          {/* Sort */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['elo', 'sign', 'sack'] as SortKey[]).map(k => (
              <button key={k} onClick={() => setSortKey(k)} style={pillStyle(sortKey === k)}>
                {k === 'elo' ? 'By ELO' : k === 'sign' ? 'By Sign %' : 'By Sack %'}
              </button>
            ))}
          </div>
        </div>

        {/* Position filters */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {(['ALL', 'FWD', 'MID', 'DEF', 'GK'] as PositionFilter[]).map(pos => (
            <button key={pos} onClick={() => setPosFilter(pos)} style={pillStyle(posFilter === pos)}>
              {pos}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: '#8899CC', textAlign: 'center', padding: '3rem 0' }}>Loading players…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <p style={{ color: '#8899CC' }}>
              {players.length === 0
                ? 'No players yet. The S³ player database will be populated before the World Cup.'
                : 'No players match your search.'}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem',
          }}>
            {filtered.map(p => {
              const total = p.sign_count + p.sell_count + p.sack_count
              const signPct = total > 0 ? Math.round((p.sign_count / total) * 100) : 0
              const sellPct = total > 0 ? Math.round((p.sell_count / total) * 100) : 0
              const sackPct = total > 0 ? Math.round((p.sack_count / total) * 100) : 0
              const myVote = votedMap[p.id] || null
              const posColor = positionColors[p.position] || positionColors.MID

              return (
                <div key={p.id} style={{
                  backgroundColor: '#0F1C4D',
                  border: '1px solid #1E3A6E',
                  borderRadius: '1.25rem',
                  padding: '1.25rem',
                }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <p style={{ margin: '0 0 0.3rem', fontWeight: 700, fontSize: '0.975rem' }}>{p.name}</p>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '0.5rem', backgroundColor: posColor.bg, color: posColor.color }}>
                          {p.position}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#8899CC' }}>{p.team}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#FBBF24', lineHeight: 1 }}>{p.elo_score}</p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.65rem', color: '#4A6080' }}>ELO</p>
                    </div>
                  </div>

                  {/* Bar chart */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    {/* Sign bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#00E676', width: '38px' }}>Sign</span>
                      <div style={{ flex: 1, backgroundColor: '#162040', borderRadius: '0.25rem', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${signPct}%`, height: '100%', backgroundColor: '#00E676', borderRadius: '0.25rem' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#8899CC', width: '28px', textAlign: 'right' }}>{signPct}%</span>
                    </div>
                    {/* Sell bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#60A5FA', width: '38px' }}>Sell</span>
                      <div style={{ flex: 1, backgroundColor: '#162040', borderRadius: '0.25rem', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${sellPct}%`, height: '100%', backgroundColor: '#60A5FA', borderRadius: '0.25rem' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#8899CC', width: '28px', textAlign: 'right' }}>{sellPct}%</span>
                    </div>
                    {/* Sack bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#ef4444', width: '38px' }}>Sack</span>
                      <div style={{ flex: 1, backgroundColor: '#162040', borderRadius: '0.25rem', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${sackPct}%`, height: '100%', backgroundColor: '#ef4444', borderRadius: '0.25rem' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#8899CC', width: '28px', textAlign: 'right' }}>{sackPct}%</span>
                    </div>
                    <p style={{ color: '#4A6080', fontSize: '0.7rem', margin: '0.4rem 0 0' }}>{total} vote{total !== 1 ? 's' : ''}</p>
                  </div>

                  {/* Vote buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['sign', 'sell', 'sack'] as VoteType[]).map(v => {
                      const isMyVote = myVote === v
                      const voted = !!myVote
                      const labels: Record<VoteType, string> = { sign: '✅ Sign', sell: '💰 Sell', sack: '❌ Sack' }
                      const colors: Record<VoteType, { active: string; border: string }> = {
                        sign: { active: '#00E676', border: '#00E676' },
                        sell: { active: '#60A5FA', border: '#60A5FA' },
                        sack: { active: '#ef4444', border: '#ef4444' },
                      }
                      return (
                        <button
                          key={v}
                          onClick={() => !voted && handleVote(p.id, v)}
                          disabled={voted || voting === p.id}
                          style={{
                            flex: 1,
                            padding: '0.45rem 0.25rem',
                            borderRadius: '0.75rem',
                            border: `1px solid ${isMyVote ? colors[v].border : '#1E3A6E'}`,
                            backgroundColor: isMyVote ? `rgba(${v === 'sign' ? '0,230,118' : v === 'sell' ? '96,165,250' : '239,68,68'},0.18)` : '#162040',
                            color: isMyVote ? colors[v].active : voted ? '#3A4A6E' : '#8899CC',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: voted ? 'default' : 'pointer',
                          }}
                        >
                          {labels[v]}
                        </button>
                      )
                    })}
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
