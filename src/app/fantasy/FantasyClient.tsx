'use client'

import { useEffect, useState, useMemo } from 'react'
import { Activity } from 'lucide-react'
import { selectStyle } from '@/lib/select-style'

// ─── Types ────────────────────────────────────────────────────────────────────

type PosType = 'ALL' | 'GKP' | 'DEF' | 'MID' | 'FOR'

interface Player {
  opta_player_id: string
  name: string
  team: string
  position: string
  pos_type: PosType
  games_played: number
  mins_total: number
  fantasy_points_total: number
  fantasy_points_avg: number
  attacking: {
    goals: number
    assists: number
    sot: number
    sh: number
    kp: number
    bc: number
  }
  defensive: {
    tackles: number
    interceptions: number
    blocks: number
    clean_sheets: number
  }
  discipline: {
    yc: number
    rc: number
    og: number
    off: number
  }
  passing: {
    pass_acc: number
    acc_long: number
    ppa: number
    ft3: number
  }
  playmaker: {
    kp: number
    bc: number
    through_balls: number
    touches_in_box: number
    winning_goals: number
  }
  possession: {
    recoveries: number
    duels_won: number
    dispossessed: number
    poss_lost: number
  }
  gk?: {
    saves: number
    high_claims: number
    pen_saves: number
  }
}

interface Competition {
  code: string
  name: string
  season: string
  rounds: Array<{
    code: string
    name: string
    playedCount: number
    fixtureCount: number
  }>
}

interface PlayerMatch {
  date: string
  round: string
  opponent: string
  result: string
  mins: number
  fantasy_points: number
  breakdown: Record<string, number>
  raw_stats: Record<string, number>
}

// ─── Color tokens ─────────────────────────────────────────────────────────────

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  border: '#1E3A6E',
  gold: '#FBBF24',
  mint: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
  red: '#FF4D6D',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FantasyClient() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [selectedComp, setSelectedComp] = useState('WC2026')
  const [selectedRound, setSelectedRound] = useState('ALL')
  const [selectedPos, setSelectedPos] = useState<PosType>('ALL')
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [drawerPlayer, setDrawerPlayer] = useState<Player | null>(null)
  const [drawerMatches, setDrawerMatches] = useState<PlayerMatch[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Fetch competitions on mount
  useEffect(() => {
    fetch('/api/fantasy/competitions')
      .then(r => r.json())
      .then(data => {
        setCompetitions(data)
      })
      .catch(console.error)
  }, [])

  // Fetch players when filters change
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      competition: selectedComp,
      round: selectedRound,
      position: selectedPos,
      limit: '500',
    })
    if (search) params.set('search', search)

    fetch(`/api/fantasy/players?${params}`)
      .then(r => r.json())
      .then(data => {
        setPlayers(data)
        setLoading(false)
      })
      .catch(e => {
        console.error(e)
        setLoading(false)
      })
  }, [selectedComp, selectedRound, selectedPos, search])

  const currentComp = competitions.find(c => c.code === selectedComp)
  const rounds = currentComp?.rounds || []

  const handlePlayerClick = (player: Player) => {
    setDrawerPlayer(player)
    setDrawerLoading(true)
    fetch(`/api/fantasy/player/${player.opta_player_id}?competition=${selectedComp}`)
      .then(r => r.json())
      .then(data => {
        setDrawerMatches(data.matches || [])
        setDrawerLoading(false)
      })
      .catch(e => {
        console.error(e)
        setDrawerLoading(false)
      })
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem 1rem 5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <Activity size={24} color={C.mint} />
          <h1 style={{ color: C.gold, fontWeight: 900, fontSize: '1.6rem', margin: 0 }}>
            Fantasy Stats
          </h1>
        </div>
        <p style={{ color: C.muted, fontSize: '0.82rem', margin: 0 }}>
          Live fantasy points · v1.4 scoring · All rounds
        </p>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '0.75rem',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Competition dropdown */}
          <select
            value={selectedComp}
            onChange={e => {
              setSelectedComp(e.target.value)
              setSelectedRound('ALL')
            }}
            style={selectStyle}
          >
            {competitions.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>

          {/* Round dropdown */}
          <select
            value={selectedRound}
            onChange={e => setSelectedRound(e.target.value)}
            style={selectStyle}
          >
            <option value="ALL">All Rounds</option>
            {rounds.map(r => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.playedCount}/{r.fixtureCount})
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Find player ⌘K"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              color: C.text,
              fontSize: '0.85rem',
              fontFamily: 'inherit',
              outline: 'none',
              minWidth: '200px',
              marginLeft: 'auto',
            }}
          />
        </div>

        {/* Position chips */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {(['ALL', 'GKP', 'DEF', 'MID', 'FOR'] as PosType[]).map(pos => (
            <button
              key={pos}
              onClick={() => setSelectedPos(pos)}
              style={{
                backgroundColor: selectedPos === pos ? '#FFFFFF' : 'transparent',
                color: selectedPos === pos ? '#0A0F2E' : C.muted,
                border: `1px solid ${selectedPos === pos ? C.mint : C.border}`,
                borderRadius: '1.5rem',
                padding: '0.35rem 1rem',
                fontSize: '0.75rem',
                fontWeight: selectedPos === pos ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: C.muted, fontSize: '0.9rem' }}>Loading players...</p>
        </div>
      ) : players.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: C.muted, fontSize: '0.9rem' }}>No players found for this selection.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <StatsGrid players={players} onPlayerClick={handlePlayerClick} />
        </div>
      )}

      {/* Drawer */}
      {drawerPlayer && (
        <PlayerDrawer
          player={drawerPlayer}
          matches={drawerMatches}
          loading={drawerLoading}
          onClose={() => setDrawerPlayer(null)}
        />
      )}
    </div>
  )
}

// ─── Stats Grid ───────────────────────────────────────────────────────────────

function StatsGrid({ players, onPlayerClick }: { players: Player[]; onPlayerClick: (p: Player) => void }) {
  const hasGK = players.some(p => p.pos_type === 'GKP')

  return (
    <div style={{ minWidth: '100%', fontSize: '0.8rem' }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '300px repeat(3, 80px) repeat(5, 60px) repeat(4, 60px) repeat(3, 60px)' + (hasGK ? ' repeat(3, 60px)' : ''),
        gap: '0.5rem',
        backgroundColor: C.card,
        borderBottom: `2px solid ${C.border}`,
        padding: '0.75rem 1rem',
        fontWeight: 700,
        fontSize: '0.7rem',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ color: C.text }}>PLAYER</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>PTS</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>GP</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>AVG</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>G</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>A</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>SoT</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>Sh</div>
        <div style={{ color: C.mint, textAlign: 'center' }}>KP</div>
        <div style={{ color: C.muted, textAlign: 'center' }}>Tk</div>
        <div style={{ color: C.muted, textAlign: 'center' }}>Int</div>
        <div style={{ color: C.muted, textAlign: 'center' }}>Bl</div>
        <div style={{ color: C.muted, textAlign: 'center' }}>CS</div>
        <div style={{ color: C.muted, textAlign: 'center' }}>YC</div>
        <div style={{ color: C.muted, textAlign: 'center' }}>RC</div>
        <div style={{ color: C.muted, textAlign: 'center' }}>OG</div>
        {hasGK && (
          <>
            <div style={{ color: C.gold, textAlign: 'center' }}>Sv</div>
            <div style={{ color: C.gold, textAlign: 'center' }}>HC</div>
            <div style={{ color: C.gold, textAlign: 'center' }}>PS</div>
          </>
        )}
      </div>

      {/* Rows */}
      {players.map(p => (
        <div
          key={p.opta_player_id}
          onClick={() => onPlayerClick(p)}
          style={{
            display: 'grid',
            gridTemplateColumns: '300px repeat(3, 80px) repeat(5, 60px) repeat(4, 60px) repeat(3, 60px)' + (hasGK ? ' repeat(3, 60px)' : ''),
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderBottom: `1px solid ${C.border}`,
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = C.card}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {/* Player identity */}
          <div>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: '0.2rem' }}>{p.name}</div>
            <div style={{ fontSize: '0.7rem', color: C.muted }}>
              {p.pos_type} · {p.team}
            </div>
          </div>

          {/* Fantasy */}
          <div style={{ textAlign: 'center', fontWeight: 700, color: C.gold }}>{p.fantasy_points_total.toFixed(1)}</div>
          <div style={{ textAlign: 'center' }}>{p.games_played}</div>
          <div style={{ textAlign: 'center' }}>{p.fantasy_points_avg.toFixed(1)}</div>

          {/* Attacking */}
          <div style={{ textAlign: 'center' }}>{p.attacking.goals || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.attacking.assists || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.attacking.sot || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.attacking.sh || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.attacking.kp || '-'}</div>

          {/* Defensive */}
          <div style={{ textAlign: 'center' }}>{p.defensive.tackles || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.defensive.interceptions || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.defensive.blocks || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.defensive.clean_sheets || '-'}</div>

          {/* Discipline */}
          <div style={{ textAlign: 'center' }}>{p.discipline.yc || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.discipline.rc || '-'}</div>
          <div style={{ textAlign: 'center' }}>{p.discipline.og || '-'}</div>

          {/* GK stats */}
          {hasGK && (
            <>
              <div style={{ textAlign: 'center' }}>{p.gk?.saves || '-'}</div>
              <div style={{ textAlign: 'center' }}>{p.gk?.high_claims || '-'}</div>
              <div style={{ textAlign: 'center' }}>{p.gk?.pen_saves || '-'}</div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Player Drawer ────────────────────────────────────────────────────────────

function PlayerDrawer({
  player,
  matches,
  loading,
  onClose,
}: {
  player: Player
  matches: PlayerMatch[]
  loading: boolean
  onClose: () => void
}) {
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 100,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: '500px',
        maxWidth: '100vw',
        backgroundColor: C.card,
        borderLeft: `1px solid ${C.border}`,
        zIndex: 101,
        overflowY: 'auto',
        padding: '1.5rem',
      }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: C.text, margin: '0 0 0.25rem' }}>
                {player.name}
              </h2>
              <p style={{ fontSize: '0.85rem', color: C.muted, margin: 0 }}>
                {player.pos_type} · {player.team}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: C.muted,
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Matches */}
        {loading ? (
          <p style={{ color: C.muted, fontSize: '0.85rem' }}>Loading matches...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {matches.map((m, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.text }}>
                      vs {m.opponent}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: C.muted }}>
                      {m.round} · {new Date(m.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: C.mint }}>
                      {m.fantasy_points.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: C.muted }}>
                      {m.mins}'
                    </div>
                  </div>
                </div>

                {/* Breakdown toggle */}
                <button
                  onClick={() => setExpandedMatch(expandedMatch === i ? null : i)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: '0.25rem',
                    color: C.muted,
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {expandedMatch === i ? 'Hide' : 'Show'} breakdown
                </button>

                {expandedMatch === i && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.7rem' }}>
                    {Object.entries(m.breakdown).map(([key, val]) => (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.25rem 0',
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        <span style={{ color: C.muted }}>{key}</span>
                        <span style={{ color: C.text, fontWeight: 600 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
