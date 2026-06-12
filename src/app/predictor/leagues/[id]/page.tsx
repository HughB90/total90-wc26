'use client'

/**
 * /predictor/leagues/[id] — league home.
 *
 * Tabs: Leaderboard / My Picks / Members / Scoring.
 * - Leaderboard rendering: rank, manager, total (0 until Wave D)
 * - My Picks: re-fetch each round's API + show this user's picks per round
 * - Members: list with admin badge; admin sees Admin link in the header
 * - Scoring: embed the rules content via a link to /predictor/scoring
 */

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthHeader from '@/components/AuthHeader'
import { flagUrl } from '@/lib/predictor-flags'
import { PREDICTOR_ROUND_OPTIONS } from '@/lib/select-style'
import ScoringRulesContent from '@/components/predictor/ScoringRulesContent'
import { PickSummaryRow, type PickSummaryData, type PickSummaryScore } from '@/components/predictor/PickSummaryRow'
import { profileFullName } from '@/lib/predictor/display-name'

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
}

interface LeagueInfo {
  league: { id: string; name: string; invite_code: string; created_by: string; created_at: string }
  members: { profile_id: string; manager_name: string; first_name: string; last_name: string; is_admin: boolean; joined_at: string }[]
  is_admin: boolean
  is_member: boolean
}

interface LeaderboardRow {
  rank: number
  profile_id: string
  manager_name: string
  first_name: string
  last_name: string
  total: number
  r1_pts: number
  r2_pts: number
  r3_pts: number
  r32_pts: number
  r16_pts: number
  qf_pts: number
  sf_pts: number
  final_pts: number
  winner_pick_pts: number
}

// Round codes in the same display order as PREDICTOR_ROUND_OPTIONS and the
// matching cache column on each leaderboard row.
const ROUND_BUCKET_KEYS: Array<{ code: string; label: string; short: string; key: keyof Pick<LeaderboardRow, 'r1_pts' | 'r2_pts' | 'r3_pts' | 'r32_pts' | 'r16_pts' | 'qf_pts' | 'sf_pts' | 'final_pts'> }> = [
  { code: 'group_r1', label: 'Round 1 — Group Stage 1', short: 'R1', key: 'r1_pts' },
  { code: 'group_r2', label: 'Round 2 — Group Stage 2', short: 'R2', key: 'r2_pts' },
  { code: 'group_r3', label: 'Round 3 — Group Stage 3', short: 'R3', key: 'r3_pts' },
  { code: 'r32',      label: 'Round 4 — Round of 32',     short: 'R4', key: 'r32_pts' },
  { code: 'r16',      label: 'Round 5 — Round of 16',     short: 'R5', key: 'r16_pts' },
  { code: 'qf',       label: 'Round 6 — Quarterfinals',    short: 'QF', key: 'qf_pts' },
  { code: 'sf',       label: 'Round 7 — Semifinals',       short: 'SF', key: 'sf_pts' },
  { code: 'final',    label: 'Round 8 — Final & 3rd Place', short: 'F', key: 'final_pts' },
]

const GOALSCORER_ROUND_CODES = new Set(['r16', 'qf', 'sf', 'final'])

type TabId = 'leaderboard' | 'my_picks' | 'members' | 'scoring'

export default function LeagueHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [me, setMe] = useState<{ id: string } | null>(null)
  const [info, setInfo] = useState<LeagueInfo | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard')
  const [copied, setCopied] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinErr, setJoinErr] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled && j?.profile?.id) setMe({ id: j.profile.id })
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/predictor/leagues/${id}`, { credentials: 'include', cache: 'no-store' })
      if (r.status === 404) { setLoadErr('League not found.'); return }
      if (!r.ok) { setLoadErr('Failed to load league.'); return }
      const j = await r.json()
      setInfo(j)
    } catch {
      setLoadErr('Network error.')
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/predictor/leaderboard?scope=league&league_id=${id}&limit=200`, {
          credentials: 'include', cache: 'no-store',
        })
        const j = await r.json().catch(() => null)
        if (!cancelled) setLeaderboard(j?.rows ?? [])
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [id])

  async function handleJoin() {
    if (!info) return
    setJoining(true); setJoinErr(null)
    try {
      const r = await fetch('/api/predictor/leagues/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: info.league.invite_code }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        setJoinErr(j?.error === 'unauthenticated' ? 'Sign in first.' : (j?.error ?? 'Join failed.'))
      } else {
        refresh()
      }
    } catch {
      setJoinErr('Network error.')
    } finally {
      setJoining(false)
    }
  }

  function copyCode() {
    if (!info) return
    navigator.clipboard.writeText(info.league.invite_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loadErr) {
    return (
      <>
        <AuthHeader />
        <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem' }}>
          <Link href="/predictor" style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to Predictor</Link>
          <div style={{ marginTop: '2rem', padding: '1.25rem', backgroundColor: C.card, border: `1px solid ${C.red}55`, borderRadius: '0.75rem', textAlign: 'center', color: C.red }}>{loadErr}</div>
        </main>
      </>
    )
  }

  if (!info) {
    return (
      <>
        <AuthHeader />
        <main style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem' }}>
          <Link href="/predictor" style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to Predictor</Link>
          <p style={{ color: C.muted, marginTop: '2rem' }}>Loading league…</p>
        </main>
      </>
    )
  }

  const myRank = me ? leaderboard.find((r) => r.profile_id === me.id)?.rank : null

  return (
    <>
      <AuthHeader />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <Link href="/predictor" style={{ color: C.muted, fontSize: '0.8rem', textDecoration: 'none' }}>← Back to Predictor</Link>

        {/* Header */}
        <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{
                color: C.gold,
                fontWeight: 900,
                fontSize: 'clamp(1.4rem, 4vw, 1.8rem)',
                margin: '0 0 0.4rem',
                letterSpacing: '-0.02em',
              }}>{info.league.name}</h1>
              <div style={{ color: C.muted, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <span>{info.members.length} member{info.members.length === 1 ? '' : 's'}</span>
                {myRank && <span>· You: #{myRank}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'rgba(251,191,36,0.06)',
                border: '1px solid rgba(251,191,36,0.25)',
                borderRadius: '0.45rem',
                padding: '0.35rem 0.6rem',
                fontSize: '0.75rem',
                color: C.muted,
              }}>
                Invite: <strong style={{ color: C.gold, letterSpacing: '0.1em' }}>{info.league.invite_code}</strong>
                <button onClick={copyCode} style={{
                  background: 'none',
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.3rem',
                  color: copied ? C.green : C.muted,
                  fontSize: '0.68rem',
                  padding: '0.15rem 0.5rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
              {info.is_admin && (
                <Link
                  href={`/predictor/leagues/${id}/admin`}
                  style={{
                    backgroundColor: 'transparent',
                    color: C.gold,
                    border: `1px solid ${C.gold}55`,
                    borderRadius: '0.4rem',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    textDecoration: 'none',
                  }}
                >Admin</Link>
              )}
            </div>
          </div>
        </div>

        {/* Not-a-member CTA */}
        {me && !info.is_member && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.85rem 1rem',
            background: 'rgba(0,230,118,0.06)',
            border: '1px solid rgba(0,230,118,0.25)',
            borderRadius: '0.65rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}>
            <span style={{ color: C.text, fontSize: '0.85rem' }}>
              You&apos;re not a member of this league yet.
            </span>
            <button
              onClick={handleJoin}
              disabled={joining}
              style={{
                backgroundColor: C.green,
                color: '#0A0F2E',
                border: 'none',
                borderRadius: '0.4rem',
                padding: '0.45rem 0.85rem',
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: joining ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >{joining ? 'Joining…' : 'Join league'}</button>
            {joinErr && <span style={{ color: C.red, fontSize: '0.75rem', width: '100%' }}>{joinErr}</span>}
          </div>
        )}

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          gap: '0.3rem',
          borderBottom: `1px solid ${C.border}`,
          marginBottom: '1rem',
          overflowX: 'auto',
        }}>
          {(['leaderboard', 'my_picks', 'members', 'scoring'] as TabId[]).map((t) => (
            <TabButton key={t} active={activeTab === t} onClick={() => setActiveTab(t)}>
              {TAB_LABELS[t]}
            </TabButton>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'leaderboard' && (
          <LeaderboardTab rows={leaderboard} meId={me?.id ?? null} />
        )}
        {activeTab === 'my_picks' && (
          <MyPicksTab authed={Boolean(me)} />
        )}
        {activeTab === 'members' && (
          <MembersTab members={info.members} meId={me?.id ?? null} createdBy={info.league.created_by} />
        )}
        {activeTab === 'scoring' && (
          <ScoringTab />
        )}
      </main>
    </>
  )
}

const TAB_LABELS: Record<TabId, string> = {
  leaderboard: 'Leaderboard',
  my_picks: 'My Picks',
  members: 'Members',
  scoring: 'Scoring',
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
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
      }}
    >{children}</button>
  )
}

function LeaderboardTab({ rows, meId }: { rows: LeaderboardRow[]; meId: string | null }) {
  // Which row is expanded to show round buckets. Only one at a time — keeps
  // the surface manageable on mobile.
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <p style={{ color: C.muted, fontSize: '0.85rem', padding: '1rem 0' }}>
        Leaderboard lights up once matches start going final. Until then everyone&apos;s on 0.
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 50px',
        gap: '0.6rem',
        padding: '0.3rem 0.55rem',
        color: C.muted,
        fontSize: '0.68rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        <span>#</span><span>Manager</span><span style={{ textAlign: 'right' }}>Total</span>
      </div>
      {rows.map((row) => (
        <ExpandableLeaderboardRow
          key={row.profile_id}
          row={row}
          isMe={row.profile_id === meId}
          expanded={expandedProfileId === row.profile_id}
          onToggle={() => setExpandedProfileId((cur) => cur === row.profile_id ? null : row.profile_id)}
        />
      ))}
      <p style={{ color: C.muted, fontSize: '0.7rem', textAlign: 'center', marginTop: '0.6rem', fontStyle: 'italic' }}>
        Tap a manager to see their round totals. Tap a round to see their picks (once that round has kicked off).
      </p>
    </div>
  )
}

function ExpandableLeaderboardRow({
  row, isMe, expanded, onToggle,
}: {
  row: LeaderboardRow
  isMe: boolean
  expanded: boolean
  onToggle: () => void
}) {
  // Layer 2 state: which round is being peeked at, lazy-loaded payload
  const [openRound, setOpenRound] = useState<string | null>(null)
  const [peekState, setPeekState] = useState<Record<string, PeekRoundState>>({})

  const totalEarned = ROUND_BUCKET_KEYS.reduce((sum, b) => sum + (row[b.key] ?? 0), 0) + (row.winner_pick_pts ?? 0)

  async function loadRound(code: string) {
    if (peekState[code]?.status === 'ok' || peekState[code]?.status === 'loading') return
    setPeekState((cur) => ({ ...cur, [code]: { status: 'loading' } }))
    try {
      const r = await fetch(
        `/api/predictor/picks/by-profile?profile_id=${encodeURIComponent(row.profile_id)}&round_code=${encodeURIComponent(code)}`,
        { credentials: 'include', cache: 'no-store' },
      )
      const j = await r.json().catch(() => null)
      if (r.status === 403) {
        const reason = j?.error === 'round_not_locked' ? 'locked' : 'forbidden'
        setPeekState((cur) => ({ ...cur, [code]: { status: 'forbidden', reason, unlocks_at: j?.unlocks_at } }))
        return
      }
      if (!r.ok || !j) {
        setPeekState((cur) => ({ ...cur, [code]: { status: 'error', error: j?.error || 'load_failed' } }))
        return
      }
      const picks = buildPickSummaryData(j.matches ?? [], j.picks ?? [], j.scores ?? {})
      setPeekState((cur) => ({ ...cur, [code]: { status: 'ok', picks } }))
    } catch {
      setPeekState((cur) => ({ ...cur, [code]: { status: 'error', error: 'network' } }))
    }
  }

  return (
    <div style={{
      display: 'grid',
      gap: 0,
      backgroundColor: isMe ? 'rgba(251,191,36,0.08)' : C.card,
      border: `1px solid ${isMe ? 'rgba(251,191,36,0.3)' : C.borderSoft}`,
      borderRadius: '0.5rem',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: 'unset',
          display: 'grid',
          gridTemplateColumns: '32px 1fr 50px',
          gap: '0.6rem',
          padding: '0.55rem',
          alignItems: 'center',
          cursor: 'pointer',
          width: 'auto',
        }}
        aria-expanded={expanded}
      >
        <span style={{ color: C.muted, fontSize: '0.74rem', fontWeight: 700 }}>#{row.rank}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: isMe ? C.gold : C.text,
            fontSize: '0.85rem',
            fontWeight: isMe ? 700 : 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ display: 'inline-block', width: 12, color: C.muted, fontSize: '0.7rem', marginRight: '0.25rem' }}>
              {expanded ? '▾' : '▸'}
            </span>
            {row.manager_name}
          </div>
          {(() => {
            const sub = profileFullName(row.first_name, row.last_name, row.manager_name)
            return sub ? (
              <div style={{ color: C.muted, fontSize: '0.7rem', paddingLeft: '0.95rem' }}>{sub}</div>
            ) : null
          })()}
        </div>
        <span style={{ color: C.gold, fontSize: '0.85rem', fontWeight: 800, textAlign: 'right' }}>{row.total}</span>
      </button>

      {expanded && (
        <div style={{
          padding: '0.5rem 0.7rem 0.7rem',
          borderTop: `1px solid ${C.borderSoft}`,
          display: 'grid',
          gap: '0.5rem',
        }}>
          {/* Layer 1: round chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {ROUND_BUCKET_KEYS.map((b) => {
              const pts = row[b.key] ?? 0
              const isOpen = openRound === b.code
              const hasPts = pts > 0
              return (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => {
                    setOpenRound(isOpen ? null : b.code)
                    if (!isOpen) loadRound(b.code)
                  }}
                  style={{
                    background: isOpen ? 'rgba(0,230,118,0.12)' : (hasPts ? 'rgba(0,230,118,0.06)' : 'rgba(255,255,255,0.03)'),
                    border: `1px solid ${isOpen ? C.green : (hasPts ? 'rgba(0,230,118,0.3)' : C.borderSoft)}`,
                    color: hasPts ? C.green : C.muted,
                    borderRadius: '0.4rem',
                    padding: '0.3rem 0.55rem',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                  aria-expanded={isOpen}
                >
                  {b.short} {pts > 0 ? `+${pts}` : '0'}
                </button>
              )
            })}
            {row.winner_pick_pts > 0 && (
              <span style={{
                background: 'rgba(251,191,36,0.12)',
                border: '1px solid rgba(251,191,36,0.4)',
                color: C.gold,
                borderRadius: '0.4rem',
                padding: '0.3rem 0.55rem',
                fontSize: '0.74rem',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}>
                🏆 +{row.winner_pick_pts}
              </span>
            )}
          </div>
          <div style={{ color: C.muted, fontSize: '0.68rem', fontWeight: 600 }}>
            Round totals · sum {totalEarned}
          </div>

          {/* Layer 2: lazy-loaded picks for the open round */}
          {openRound && (() => {
            const meta = ROUND_BUCKET_KEYS.find((b) => b.code === openRound)
            const s = peekState[openRound]
            return (
              <div style={{
                marginTop: '0.3rem',
                padding: '0.6rem 0.7rem',
                background: 'rgba(10,15,46,0.55)',
                border: `1px solid ${C.borderSoft}`,
                borderRadius: '0.5rem',
                display: 'grid',
                gap: '0.45rem',
              }}>
                <div style={{ color: C.gold, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {meta?.label ?? openRound}
                </div>
                {!s || s.status === 'loading' ? (
                  <div style={{ color: C.muted, fontSize: '0.78rem' }}>Loading…</div>
                ) : s.status === 'forbidden' && s.reason === 'locked' ? (
                  <div style={{ color: C.muted, fontSize: '0.78rem' }}>
                    Picks visible after the round kicks off.
                    {s.unlocks_at && (
                      <span style={{ display: 'block', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                        First lock: {new Date(s.unlocks_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT
                      </span>
                    )}
                  </div>
                ) : s.status === 'forbidden' ? (
                  <div style={{ color: C.muted, fontSize: '0.78rem' }}>You need to share a league with this manager to peek at their picks.</div>
                ) : s.status === 'error' ? (
                  <div style={{ color: C.red, fontSize: '0.78rem' }}>Couldn&apos;t load picks ({s.error}).</div>
                ) : s.picks.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: '0.78rem' }}>No picks submitted.</div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.4rem' }}>
                    {s.picks.map((p) => (
                      <PickSummaryRow key={p.match_id} pick={p} showGoalscorer={GOALSCORER_ROUND_CODES.has(openRound)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

type PeekRoundState =
  | { status: 'loading' }
  | { status: 'ok'; picks: PickSummaryData[] }
  | { status: 'forbidden'; reason: 'locked' | 'forbidden'; unlocks_at?: string }
  | { status: 'error'; error: string }

interface RawPeekMatch {
  id: string
  home_team_code: string
  away_team_code: string
  home_score: number | null
  away_score: number | null
  went_to_pks: boolean | null
  pk_winner_team_code: string | null
}

interface RawPeekPick {
  match_id: string
  home_score: number
  away_score: number
  is_star: boolean
  if_draw_winner?: string | null
  goalscorer_team_code?: string | null
  goalscorer_player?: { short_name?: string | null; name?: string | null; last_name?: string | null } | null
}

/**
 * Build PickSummaryData[] from the raw by-profile response. Mirrors the same
 * mapping the My Picks tab does so the shared <PickSummaryRow /> renders
 * identically across both surfaces.
 */
function buildPickSummaryData(
  matches: RawPeekMatch[],
  picks: RawPeekPick[],
  scores: Record<string, PickSummaryScore>,
): PickSummaryData[] {
  const matchMap = new Map<string, RawPeekMatch>()
  for (const m of matches) matchMap.set(m.id, m)
  return picks.map((p) => {
    const mm = matchMap.get(p.match_id)
    const gp = p.goalscorer_player
    const goalscorerName = gp?.short_name || gp?.name || gp?.last_name || null
    return {
      match_id: p.match_id,
      home_team: mm?.home_team_code ?? '?',
      away_team: mm?.away_team_code ?? '?',
      pick_home: p.home_score,
      pick_away: p.away_score,
      is_star: Boolean(p.is_star),
      if_draw_winner: p.if_draw_winner ?? null,
      goalscorer_name: goalscorerName,
      goalscorer_team: p.goalscorer_team_code ?? null,
      actual_home: mm?.home_score ?? null,
      actual_away: mm?.away_score ?? null,
      went_to_pks: Boolean(mm?.went_to_pks),
      pk_winner_team_code: mm?.pk_winner_team_code ?? null,
      score: scores[p.match_id] ?? null,
    }
  })
}

interface MyRoundSummary {
  code: string
  label: string
  picks: PickSummaryData[]
  matchCount: number
  round_pts: number
  finalized_count: number
}

function MyPicksTab({ authed }: { authed: boolean }) {
  const [rounds, setRounds] = useState<MyRoundSummary[] | null>(null)
  const [winnerPick, setWinnerPick] = useState<string | null>(null)

  useEffect(() => {
    if (!authed) return
    let cancelled = false
    ;(async () => {
      const results = await Promise.all(PREDICTOR_ROUND_OPTIONS.map(async (rm) => {
        try {
          const r = await fetch(`/api/predictor/round/${rm.code}`, { credentials: 'include', cache: 'no-store' })
          if (!r.ok) return { code: rm.code, label: rm.label, picks: [], matchCount: 0, round_pts: 0, finalized_count: 0 }
          const j = await r.json()
          const matches = (j.matches ?? []) as {
            id: string
            home_team_code: string
            away_team_code: string
            home_score: number | null
            away_score: number | null
            went_to_pks: boolean | null
            pk_winner_team_code: string | null
          }[]
          const matchMap = new Map<string, typeof matches[number]>()
          for (const m of matches) matchMap.set(m.id, m)
          const myScores = (j.my_scores ?? {}) as Record<string, PickSummaryScore>
          const picks: PickSummaryData[] = (j.my_picks ?? []).map((p: {
            match_id: string
            home_score: number
            away_score: number
            is_star: boolean
            if_draw_winner?: string | null
            goalscorer_team_code?: string | null
            goalscorer_player?: { short_name?: string | null; name?: string | null; last_name?: string | null } | null
          }) => {
            const gp = p.goalscorer_player
            const goalscorerName = gp?.short_name || gp?.name || gp?.last_name || null
            const mm = matchMap.get(p.match_id)
            return {
              match_id: p.match_id,
              home_team: mm?.home_team_code ?? '?',
              away_team: mm?.away_team_code ?? '?',
              pick_home: p.home_score,
              pick_away: p.away_score,
              is_star: Boolean(p.is_star),
              if_draw_winner: p.if_draw_winner ?? null,
              goalscorer_name: goalscorerName,
              goalscorer_team: p.goalscorer_team_code ?? null,
              actual_home: mm?.home_score ?? null,
              actual_away: mm?.away_score ?? null,
              went_to_pks: Boolean(mm?.went_to_pks),
              pk_winner_team_code: mm?.pk_winner_team_code ?? null,
              score: myScores[p.match_id] ?? null,
            }
          })
          const round_pts = picks.reduce((acc, p) => acc + (p.score?.total_pts ?? 0), 0)
          const finalized_count = matches.filter((m) => m.home_score !== null && m.away_score !== null).length
          return { code: rm.code, label: rm.label, picks, matchCount: matches.length, round_pts, finalized_count }
        } catch {
          return { code: rm.code, label: rm.label, picks: [], matchCount: 0, round_pts: 0, finalized_count: 0 }
        }
      }))
      if (!cancelled) setRounds(results)
    })()
    ;(async () => {
      try {
        const r = await fetch('/api/predictor/winner', { credentials: 'include', cache: 'no-store' })
        const j = await r.json().catch(() => null)
        if (!cancelled) setWinnerPick(j?.pick?.team_code ?? null)
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [authed])

  if (!authed) {
    return <p style={{ color: C.muted, fontSize: '0.85rem', padding: '1rem 0' }}>Sign in to see your picks.</p>
  }
  if (!rounds) {
    return <p style={{ color: C.muted, fontSize: '0.85rem', padding: '1rem 0' }}>Loading your picks…</p>
  }

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '0.7rem',
        padding: '0.85rem 1rem',
      }}>
        <div style={{ color: C.gold, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>Tournament Winner</div>
        {winnerPick ? (
          <div style={{ color: C.text, fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src={flagUrl(winnerPick)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} style={{ width: 22, height: 14, objectFit: 'cover', borderRadius: 2 }} />
            <strong>{winnerPick}</strong>
          </div>
        ) : (
          <div style={{ color: C.muted, fontSize: '0.82rem' }}>Not picked yet.</div>
        )}
      </div>
      {rounds.map((r) => (
        <div key={r.code} style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.7rem',
          padding: '0.85rem 1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
            <div style={{ color: C.gold, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              {r.finalized_count > 0 && (
                <span style={{ color: '#00E676', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {r.round_pts > 0 ? `+${r.round_pts}` : r.round_pts} pts
                </span>
              )}
              <span style={{ color: C.muted, fontSize: '0.7rem' }}>
                {r.picks.length} pick{r.picks.length === 1 ? '' : 's'}
              </span>
            </span>
          </div>
          {r.picks.length === 0 ? (
            <div style={{ color: C.muted, fontSize: '0.78rem' }}>No picks submitted.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              {r.picks.map((p) => (
                <PickSummaryRow
                  key={p.match_id}
                  pick={p}
                  showGoalscorer={GOALSCORER_ROUND_CODES.has(r.code)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MembersTab({ members, meId, createdBy }: {
  members: { profile_id: string; manager_name: string; first_name: string; last_name: string; is_admin: boolean; joined_at: string }[]
  meId: string | null
  createdBy: string
}) {
  return (
    <div style={{ display: 'grid', gap: '0.4rem' }}>
      {members.map((m) => (
        <div key={m.profile_id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.55rem 0.7rem',
          backgroundColor: m.profile_id === meId ? 'rgba(251,191,36,0.08)' : C.card,
          border: `1px solid ${m.profile_id === meId ? 'rgba(251,191,36,0.3)' : C.borderSoft}`,
          borderRadius: '0.5rem',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: m.profile_id === meId ? C.gold : C.text,
              fontSize: '0.85rem',
              fontWeight: m.profile_id === meId ? 700 : 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{m.manager_name}</div>
            {(() => {
              const sub = profileFullName(m.first_name, m.last_name, m.manager_name)
              return sub ? (
                <div style={{ color: C.muted, fontSize: '0.7rem' }}>{sub}</div>
              ) : null
            })()}
          </div>
          {m.profile_id === createdBy ? (
            <span style={{ color: C.gold, fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Owner</span>
          ) : m.is_admin ? (
            <span style={{ color: C.gold, fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ScoringTab() {
  // Shared rules content — same component used on /predictor/scoring and the /predictor Scoring tab.
  return <ScoringRulesContent />
}
