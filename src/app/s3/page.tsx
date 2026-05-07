'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import VotingCard from './VotingCard'

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
  sign_count?: number
  sell_count?: number
  sack_count?: number
  vote_count?: number
  market_value?: number
  club?: string
}

type Vote = 'sign' | 'sell' | 'sack'
type SortKey = 't90' | 'age'
type PosFilter = 'All' | 'FWD' | 'MID' | 'DEF' | 'GK'
type PageSize = 25 | 50 | 100

const COUNTRY_CODES: Record<string, string> = {
  'England': 'gb-eng', 'France': 'fr', 'Spain': 'es', 'Germany': 'de',
  'Brazil': 'br', 'Argentina': 'ar', 'Portugal': 'pt', 'Netherlands': 'nl',
  'Belgium': 'be', 'Italy': 'it', 'Morocco': 'ma', 'USA': 'us',
  'Mexico': 'mx', 'Japan': 'jp', 'Colombia': 'co', 'Uruguay': 'uy',
  'Croatia': 'hr', 'Senegal': 'sn', 'Canada': 'ca', 'Switzerland': 'ch',
  'Ecuador': 'ec', 'Denmark': 'dk', 'Australia': 'au', 'Poland': 'pl',
  'South Korea': 'kr', 'Serbia': 'rs', 'Austria': 'at', 'Turkey': 'tr', 'Türkiye': 'tr',
  'Czechia': 'cz', 'Scotland': 'gb-sct', "Côte d'Ivoire": 'ci',
  'Nigeria': 'ng', 'Chile': 'cl', 'Peru': 'pe', 'Paraguay': 'py',
  'Costa Rica': 'cr', 'Jamaica': 'jm', 'New Zealand': 'nz', 'Iraq': 'iq',
  'Cabo Verde': 'cv', 'Sweden': 'se', 'Norway': 'no', 'Romania': 'ro',
}

function getFlagUrl(nationality: string) {
  const code = COUNTRY_CODES[nationality] ?? nationality.toLowerCase().replace(/\s+/g, '-')
  return `https://flagcdn.com/w160/${code}.png`
}

const posColors: Record<string, { bg: string; color: string }> = {
  FWD: { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  MID: { bg: 'rgba(96,165,250,0.15)', color: '#60A5FA' },
  DEF: { bg: 'rgba(0,230,118,0.15)',  color: '#00E676' },
  GK:  { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
}

const voteConfig = {
  sign: {
    label: 'SIGN', icon: '↑',
    activeBg: 'transparent', activeBorder: '#00E676', activeColor: '#00E676',
    selectedBg: '#00E676', selectedBorder: '#00E676', selectedColor: '#0A1A0F',
    disabledBg: 'transparent', disabledBorder: '#1E3A2A', disabledColor: '#2d5a3a',
    barColor: '#00E676',
  },
  sell: {
    label: 'SELL', icon: '↔',
    activeBg: 'transparent', activeBorder: '#60A5FA', activeColor: '#60A5FA',
    selectedBg: '#60A5FA', selectedBorder: '#60A5FA', selectedColor: '#0A1020',
    disabledBg: 'transparent', disabledBorder: '#1E2A3A', disabledColor: '#2d3a5a',
    barColor: '#60A5FA',
  },
  sack: {
    label: 'SACK', icon: '↓',
    activeBg: 'transparent', activeBorder: '#ef4444', activeColor: '#ef4444',
    selectedBg: '#ef4444', selectedBorder: '#ef4444', selectedColor: '#1A0A0A',
    disabledBg: 'transparent', disabledBorder: '#3A1E1E', disabledColor: '#5a2d2d',
    barColor: '#ef4444',
  },
}

const t90Tier = (score: number) => {
  if (score >= 100) return { label: 'Elite',       color: '#FFD700' }
  if (score >= 80)  return { label: 'World Class', color: '#C084FC' }
  if (score >= 60)  return { label: 'Top Tier',    color: '#60A5FA' }
  if (score >= 40)  return { label: 'Quality',     color: '#00E676' }
  return              { label: 'Solid',        color: '#8899CC' }
}

const t90TierDetail = (score: number) => {
  if (score >= 100) return { label: 'Elite',   color: '#FFD700' }
  if (score >= 85)  return { label: 'Premium', color: '#C084FC' }
  if (score >= 70)  return { label: 'Solid',   color: '#60A5FA' }
  if (score >= 55)  return { label: 'Depth',   color: '#00E676' }
  return              { label: 'Fringe',  color: '#8899CC' }
}

function formatMarketValue(v?: number | null): string | null {
  if (v == null || v === 0) return null
  if (v >= 1_000_000_000) return `€${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `€${Math.round(v / 1_000_000)}M`
  return `€${v.toLocaleString()}`
}

const SS_SEEN_KEY = 's3_seen'
const SS_DETAIL_VOTES_KEY = 's3_detail_votes'
const ROW_HEIGHT = 60 // px estimate per player row

function getSeenIds(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(sessionStorage.getItem(SS_SEEN_KEY) || '[]') } catch { return [] }
}

function addSeenIds(ids: string[]) {
  if (typeof window === 'undefined') return
  const seen = getSeenIds()
  const updated = [...new Set([...seen, ...ids])].slice(-300)
  sessionStorage.setItem(SS_SEEN_KEY, JSON.stringify(updated))
}

function getDetailVotes(): Record<string, Vote> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(SS_DETAIL_VOTES_KEY) || '{}') } catch { return {} }
}

function saveDetailVote(playerId: string, vote: Vote) {
  if (typeof window === 'undefined') return
  const votes = getDetailVotes()
  votes[playerId] = vote
  sessionStorage.setItem(SS_DETAIL_VOTES_KEY, JSON.stringify(votes))
}

function pickThreePlayers(pool: Player[]): Player[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 3)
}

export default function S3Page() {
  // ── Leaderboard state ─────────────────────────────────────────────
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('t90')
  const [posFilter, setPosFilter] = useState<PosFilter>('All')
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [page, setPage] = useState(1)

  // ── Overlay state ─────────────────────────────────────────────────
  const [showOverlay, setShowOverlay] = useState(false)
  const [overlayPlayers, setOverlayPlayers] = useState<Player[]>([])
  const [overlayVotes, setOverlayVotes] = useState<Record<string, Vote>>({})
  const [overlayFlash, setOverlayFlash] = useState(false)
  const [overlaySessionCount, setOverlaySessionCount] = useState(0)

  // ── Detail modal state ────────────────────────────────────────────
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [detailVotes, setDetailVotes] = useState<Record<string, Vote>>({})
  const [detailSubmitting, setDetailSubmitting] = useState(false)
  const [detailFlash, setDetailFlash] = useState<Vote | null>(null)

  // ── Refs ──────────────────────────────────────────────────────────
  const playerListRef = useRef<HTMLDivElement>(null)
  const overlayShownRef = useRef(false)          // has the overlay been shown yet this session?
  const dismissScrollYRef = useRef<number | null>(null) // scroll Y when X-closed
  const submitCooldownRef = useRef(false)        // in 10-sec post-submit cooldown
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playersRef = useRef<Player[]>([])        // mirror for use in scroll handler

  // ── Load players ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/s3/players')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setPlayers(d)
          playersRef.current = d
        }
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Init detail votes from sessionStorage ─────────────────────────
  useEffect(() => {
    setDetailVotes(getDetailVotes())
    setOverlaySessionCount(
      Object.keys(getDetailVotes()).length
    )
  }, [])

  // ── Reset to page 1 on filter change ─────────────────────────────
  useEffect(() => { setPage(1) }, [search, posFilter, sortKey, pageSize])

  // ── Pre-load overlay players (picks from loaded players) ──────────
  const refreshOverlayPlayers = useCallback((allPlayers: Player[]) => {
    if (allPlayers.length === 0) return
    const seen = getSeenIds()
    let pool = allPlayers.filter(p => !seen.includes(p.id))
    if (pool.length < 3) {
      sessionStorage.removeItem(SS_SEEN_KEY)
      pool = [...allPlayers]
    }
    setOverlayPlayers(pickThreePlayers(pool))
    setOverlayVotes({})
  }, [])

  // ── Show overlay (if not suppressed) ─────────────────────────────
  const tryShowOverlay = useCallback(() => {
    if (overlayShownRef.current) return
    if (submitCooldownRef.current) return
    if (playersRef.current.length === 0) return
    overlayShownRef.current = true
    refreshOverlayPlayers(playersRef.current)
    setShowOverlay(true)
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [refreshOverlayPlayers])

  // ── 5-second timer trigger ────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    timerRef.current = setTimeout(() => {
      tryShowOverlay()
    }, 5000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [loading, tryShowOverlay])

  // ── Scroll trigger ────────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      const list = playerListRef.current
      if (!list) return

      const listTop = list.getBoundingClientRect().top + window.scrollY

      // Initial trigger: scrolled past 3 rows from the top of the player list
      if (!overlayShownRef.current && !submitCooldownRef.current) {
        const triggerY = listTop + ROW_HEIGHT * 3
        if (window.scrollY > triggerY) {
          tryShowOverlay()
          return
        }
      }

      // Re-show after X-close: scrolled 10 more rows
      if (
        !showOverlay &&
        overlayShownRef.current &&
        dismissScrollYRef.current !== null &&
        !submitCooldownRef.current &&
        window.scrollY > dismissScrollYRef.current + ROW_HEIGHT * 10
      ) {
        dismissScrollYRef.current = null
        refreshOverlayPlayers(playersRef.current)
        setShowOverlay(true)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [showOverlay, tryShowOverlay, refreshOverlayPlayers])

  // ── Overlay submit ────────────────────────────────────────────────
  const handleOverlaySubmit = async () => {
    if (overlayPlayers.length === 0) return
    if (!overlayPlayers.every(p => overlayVotes[p.id])) return

    addSeenIds(overlayPlayers.map(p => p.id))
    // Save to detail votes so modal shows selection
    overlayPlayers.forEach(p => {
      const v = overlayVotes[p.id]
      if (v) saveDetailVote(p.id, v)
    })
    setDetailVotes(getDetailVotes())
    setOverlaySessionCount(c => c + overlayPlayers.length)

    await fetch('/api/s3/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ votes: overlayPlayers.map(p => ({ playerId: p.id, vote: overlayVotes[p.id] })) }),
    }).catch(() => {})

    setOverlayFlash(true)
    setTimeout(() => {
      setOverlayFlash(false)
      setShowOverlay(false)
      overlayShownRef.current = false   // allow re-show after cooldown
      // Post-submit: 10-second cooldown before re-showing
      submitCooldownRef.current = true
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
      cooldownTimerRef.current = setTimeout(() => {
        submitCooldownRef.current = false
        // Pre-load next batch for next trigger
        refreshOverlayPlayers(playersRef.current)
      }, 10000)
    }, 1500)
  }

  // ── Overlay close (X button) ──────────────────────────────────────
  const handleOverlayClose = () => {
    setShowOverlay(false)
    dismissScrollYRef.current = window.scrollY
    // overlayShownRef stays true — re-show is handled by scroll distance
  }

  // ── Detail modal vote ─────────────────────────────────────────────
  const handleDetailVote = async (vote: Vote) => {
    if (!selectedPlayer || detailSubmitting) return
    setDetailSubmitting(true)
    setDetailFlash(vote)

    await fetch('/api/s3/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ votes: [{ playerId: selectedPlayer.id, vote }] }),
    }).catch(() => {})

    saveDetailVote(selectedPlayer.id, vote)
    setDetailVotes(getDetailVotes())
    setDetailSubmitting(false)
    setTimeout(() => setDetailFlash(null), 1500)
  }

  // ── Leaderboard filter + sort ─────────────────────────────────────
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

  const overlayAllVoted = overlayPlayers.length > 0 && overlayPlayers.every(p => overlayVotes[p.id])

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div>
        <VotingCard />
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem 1rem 2rem' }}>

          {/* Header */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 900, margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>
              📊 S³ Ratings
            </h1>
            <p style={{ color: '#8899CC', fontSize: '0.95rem', margin: '0 0 0.3rem' }}>
              Sign · Sell · Sack — Total90 player valuations for World Cup 2026
            </p>
            <p style={{ color: '#4A6080', fontSize: '0.78rem', margin: 0 }}>
              {players.length} players ranked · Click any player to vote
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
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {(['All', 'FWD', 'MID', 'DEF', 'GK'] as PosFilter[]).map(p => (
                <button key={p} onClick={() => setPosFilter(p)} style={{ padding: '0.4rem 0.7rem', borderRadius: '0.5rem', border: '1px solid', borderColor: posFilter === p ? '#00E676' : '#1E3A6E', backgroundColor: posFilter === p ? 'rgba(0,230,118,0.1)' : 'transparent', color: posFilter === p ? '#00E676' : '#8899CC', cursor: 'pointer', fontSize: '0.75rem', fontWeight: posFilter === p ? 700 : 400, fontFamily: 'inherit' }}>{p}</button>
              ))}
            </div>
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
            <div ref={playerListRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {paginated.map((p) => {
                const globalRank = filtered.indexOf(p) + 1
                const tier = t90Tier(p.s3_value)
                const posStyle = posColors[p.position] || posColors.MID
                const hasVoted = !!detailVotes[p.id]
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlayer(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#0F1C4D', border: `1px solid ${hasVoted ? '#1E5A3A' : '#1E3A6E'}`, borderRadius: '0.75rem', padding: '0.5rem 1rem', cursor: 'pointer', transition: 'border-color 0.15s, background-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#152355')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0F1C4D')}
                  >
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
                    {hasVoted && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: '0.4rem', backgroundColor: voteConfig[detailVotes[p.id]].selectedBg + '22', color: voteConfig[detailVotes[p.id]].barColor, flexShrink: 0, border: `1px solid ${voteConfig[detailVotes[p.id]].barColor}44` }}>
                        {detailVotes[p.id].toUpperCase()}
                      </span>
                    )}
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
      </div>

      {/* ── Pop-up voting overlay ──────────────────────────────────── */}
      {showOverlay && overlayPlayers.length > 0 && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.2s ease' }}
          onClick={e => { if (e.target === e.currentTarget) handleOverlayClose() }}
        >
          <div style={{
            backgroundColor: '#0A0F2E',
            border: '1px solid #1E3A6E',
            borderRadius: '1.25rem 1.25rem 0 0',
            padding: '1.25rem 1rem 1.5rem',
            width: '100%',
            maxWidth: '500px',
            animation: 'slideUp 0.3s ease',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            {/* Overlay header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem', color: '#FBBF24', letterSpacing: '-0.02em' }}>Rate These Players</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#8899CC' }}>
                  <span style={{ color: '#00E676', fontWeight: 600 }}>Sign</span> the most valuable ·{' '}
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Sack</span> the least
                </p>
              </div>
              <button
                onClick={handleOverlayClose}
                style={{ background: 'none', border: '1px solid #1E3A6E', color: '#8899CC', cursor: 'pointer', borderRadius: '0.5rem', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0, fontFamily: 'inherit' }}
                aria-label="Close"
              >×</button>
            </div>

            {overlaySessionCount > 0 && (
              <p style={{ color: '#4A6080', fontSize: '0.7rem', margin: '0.3rem 0 0.75rem', textAlign: 'center' }}>
                You&apos;ve voted on {overlaySessionCount} players this session
              </p>
            )}

            {/* Player cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.75rem 0' }}>
              {overlayPlayers.map(p => {
                const selected = overlayVotes[p.id]
                return (
                  <div
                    key={p.id}
                    style={{ backgroundColor: '#0F1C4D', border: `1px solid ${selected ? voteConfig[selected].selectedBg + '80' : '#1E3A6E'}`, borderRadius: '0.875rem', overflow: 'hidden', transition: 'border-color 0.15s' }}
                  >
                    {/* Player info row — clickable to open detail modal */}
                    <div
                      onClick={() => { setSelectedPlayer(p); handleOverlayClose() }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.875rem', cursor: 'pointer' }}
                    >
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <img
                          src={p.photo_url || 'https://tituygkbondyjhzomwji.supabase.co/storage/v1/object/public/player-photos/players/default.png'}
                          alt=""
                          style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #1E3A6E', display: 'block' }}
                          onError={e => { (e.target as HTMLImageElement).src = 'https://tituygkbondyjhzomwji.supabase.co/storage/v1/object/public/player-photos/players/default.png' }}
                        />
                        <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '17px', height: '17px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0A0F2E' }}>
                          <img src={getFlagUrl(p.nationality)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#F0F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.short_name || p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#8899CC' }}>
                          <span style={{ color: posColors[p.position]?.color ?? '#8899CC', fontWeight: 600 }}>{p.position}</span>
                          {' · '}{p.nationality}{p.age ? ` · ${p.age} y.o.` : ''}
                        </div>
                      </div>
                      <span style={{ color: '#4A6080', fontSize: '0.7rem' }}>↗</span>
                    </div>

                    {/* Vote buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid #1E3A6E' }}>
                      {(['sign', 'sell', 'sack'] as Vote[]).map((v, i) => {
                        const cfg = voteConfig[v]
                        const isSelected = selected === v
                        const isUsedByOther = Object.entries(overlayVotes).some(([pid, pv]) => pv === v && pid !== p.id)
                        return (
                          <button
                            key={v}
                            onClick={e => {
                              e.stopPropagation()
                              if (isSelected) {
                                setOverlayVotes(prev => { const n = { ...prev }; delete n[p.id]; return n })
                              } else if (!isUsedByOther) {
                                setOverlayVotes(prev => ({ ...prev, [p.id]: v }))
                              }
                            }}
                            style={{
                              padding: '0.55rem 0.25rem',
                              border: 'none',
                              borderRight: i < 2 ? '1px solid #1E3A6E' : 'none',
                              backgroundColor: isSelected ? cfg.selectedBg : cfg.activeBg,
                              color: isSelected ? cfg.selectedColor : isUsedByOther ? cfg.disabledColor : cfg.activeColor,
                              cursor: isUsedByOther && !isSelected ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                              fontWeight: 800,
                              fontSize: '0.72rem',
                              letterSpacing: '0.06em',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '0.15rem',
                              transition: 'background-color 0.12s, color 0.12s',
                            }}
                          >
                            <span style={{ fontSize: '0.85rem', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: isSelected ? 'rgba(0,0,0,0.15)' : `${cfg.activeBorder}18` }}>{cfg.icon}</span>
                            <span>{cfg.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Overlay footer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {overlayFlash ? (
                <div style={{ textAlign: 'center', padding: '0.75rem', borderRadius: '0.875rem', backgroundColor: 'rgba(0,230,118,0.15)', color: '#00E676', fontWeight: 700, fontSize: '1rem' }}>
                  ✓ Votes submitted!
                </div>
              ) : (
                <>
                  <button
                    onClick={handleOverlaySubmit}
                    disabled={!overlayAllVoted}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.875rem', border: 'none', backgroundColor: overlayAllVoted ? '#00E676' : '#162040', color: overlayAllVoted ? '#0A0F2E' : '#4A6080', fontWeight: 800, fontSize: '1rem', cursor: overlayAllVoted ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'all 0.2s' }}
                  >
                    {overlayAllVoted ? 'Submit Votes →' : `Rate all ${overlayPlayers.filter(p => !overlayVotes[p.id]).length} remaining`}
                  </button>
                  <button
                    onClick={() => {
                      addSeenIds(overlayPlayers.map(p => p.id))
                      refreshOverlayPlayers(playersRef.current)
                    }}
                    style={{ background: 'none', border: 'none', color: '#4A6080', fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', padding: '0.25rem' }}
                  >
                    I don&apos;t know all of these →
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Player detail modal ────────────────────────────────────── */}
      {selectedPlayer && (() => {
        const p = selectedPlayer
        const vc = p.vote_count ?? 0
        const sc = p.sign_count ?? 0
        const slc = p.sell_count ?? 0
        const sack = p.sack_count ?? 0
        const tier = t90TierDetail(p.s3_value)
        const mv = formatMarketValue(p.market_value)
        const alreadyVoted = detailVotes[p.id]
        const signPct = vc > 0 ? Math.round((sc / vc) * 100) : 0
        const sellPct = vc > 0 ? Math.round((slc / vc) * 100) : 0
        const sackPct = vc > 0 ? Math.round((sack / vc) * 100) : 0

        return (
          <div
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.2s ease' }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedPlayer(null) }}
          >
            <div style={{ backgroundColor: '#0A0F2E', border: '1px solid #1E3A6E', borderRadius: '1.25rem', padding: '1.25rem', width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto', animation: 'slideUp 0.25s ease' }}>

              {/* Close */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button onClick={() => setSelectedPlayer(null)} style={{ background: 'none', border: '1px solid #1E3A6E', color: '#8899CC', cursor: 'pointer', borderRadius: '0.5rem', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontFamily: 'inherit' }} aria-label="Close">×</button>
              </div>

              {/* Player header */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.short_name || p.name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #1E3A6E', backgroundColor: '#162040' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#162040', border: '2px solid #1E3A6E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', color: '#4A6080', fontWeight: 700 }}>{(p.short_name || p.name).charAt(0)}</div>
                  )}
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0A0F2E' }}>
                    <img src={getFlagUrl(p.nationality)} alt={p.nationality} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#F0F4FF', marginBottom: '0.25rem' }}>{p.short_name || p.name}</div>
                  <div style={{ color: '#8899CC', fontSize: '0.82rem', marginBottom: '0.15rem' }}>
                    <span style={{ color: posColors[p.position]?.color ?? '#8899CC', fontWeight: 700 }}>{p.position}</span>
                    {' · '}{p.nationality}
                  </div>
                  <div style={{ color: '#8899CC', fontSize: '0.78rem' }}>
                    {p.age ? `Age ${p.age}` : ''}
                    {p.club ? `${p.age ? ' · ' : ''}${p.club}` : ''}
                  </div>
                </div>
              </div>

              {/* T90 Score */}
              <div style={{ backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.875rem', padding: '0.875rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: '#8899CC', fontSize: '0.78rem', fontWeight: 600 }}>T90 Score</span>
                  <span style={{ color: tier.color, fontWeight: 800, fontSize: '1.05rem' }}>{p.s3_value} · {tier.label}</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#1E3A6E', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (p.s3_value / 130) * 100)}%`, backgroundColor: tier.color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                </div>
              </div>

              {/* Community Votes */}
              <div style={{ backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.875rem', padding: '0.875rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ color: '#8899CC', fontSize: '0.78rem', fontWeight: 600 }}>Community Votes</span>
                  <span style={{ color: '#4A6080', fontSize: '0.72rem' }}>{vc.toLocaleString()} total</span>
                </div>
                {vc === 0 ? (
                  <div style={{ textAlign: 'center', color: '#4A6080', fontSize: '0.82rem', padding: '0.5rem 0' }}>Be the first to vote!</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {([['sign', signPct], ['sell', sellPct], ['sack', sackPct]] as [Vote, number][]).map(([v, pct]) => (
                      <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: voteConfig[v].barColor, fontWeight: 700, fontSize: '0.72rem', width: '32px', textAlign: 'right', textTransform: 'uppercase' }}>{v}</span>
                        <div style={{ flex: 1, height: '6px', backgroundColor: '#1E3A6E', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: voteConfig[v].barColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ color: '#8899CC', fontSize: '0.72rem', width: '28px' }}>{pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Market value */}
              {mv && (
                <div style={{ backgroundColor: '#0F1C4D', border: '1px solid #1E3A6E', borderRadius: '0.875rem', padding: '0.6rem 1rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#8899CC', fontSize: '0.78rem' }}>Market Value</span>
                  <span style={{ color: '#FBBF24', fontWeight: 700, fontSize: '0.9rem' }}>{mv}</span>
                </div>
              )}

              {/* Vote buttons or voted state */}
              {detailFlash ? (
                <div style={{ textAlign: 'center', padding: '0.875rem', borderRadius: '0.875rem', backgroundColor: `${voteConfig[detailFlash].selectedBg}22`, color: voteConfig[detailFlash].barColor, fontWeight: 700, fontSize: '1rem', border: `1px solid ${voteConfig[detailFlash].barColor}44` }}>
                  ✓ {detailFlash.charAt(0).toUpperCase() + detailFlash.slice(1)} recorded!
                </div>
              ) : alreadyVoted ? (
                <div style={{ backgroundColor: `${voteConfig[alreadyVoted].selectedBg}15`, border: `1px solid ${voteConfig[alreadyVoted].barColor}44`, borderRadius: '0.875rem', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8899CC', fontSize: '0.8rem' }}>Your vote</span>
                  <span style={{ color: voteConfig[alreadyVoted].barColor, fontWeight: 800, fontSize: '0.9rem' }}>
                    {voteConfig[alreadyVoted].icon} {alreadyVoted.toUpperCase()}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {(['sign', 'sell', 'sack'] as Vote[]).map(v => {
                    const cfg = voteConfig[v]
                    return (
                      <button
                        key={v}
                        onClick={() => handleDetailVote(v)}
                        disabled={detailSubmitting}
                        style={{ padding: '0.7rem 0.5rem', borderRadius: '0.75rem', border: `1px solid ${cfg.activeBorder}`, backgroundColor: cfg.activeBg, color: cfg.activeColor, cursor: detailSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget.style.backgroundColor = cfg.activeBorder + '22') }}
                        onMouseLeave={e => { (e.currentTarget.style.backgroundColor = cfg.activeBg) }}
                      >
                        <span style={{ fontSize: '1.1rem' }}>{cfg.icon}</span>
                        <span>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </>
  )
}
