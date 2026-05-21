'use client'

/**
 * /predictor — Wave C home dashboard.
 *
 * Order top → bottom:
 *   1. Hero with two stacked countdown chips (R1 lock + winner lock — same time)
 *   2. Global Leaderboard + My Leagues 2-up panel
 *   3. Tournament winner card (flag next to picked team when set)
 *   4. 8-round list (replaces the "Round 1 + Coming soon" cards)
 *
 * Scoring engine isn't shipped yet (Wave D). Leaderboard endpoint returns
 * zeros — UI renders them without crashing.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthHeader from '@/components/AuthHeader'
import { flagUrl } from '@/lib/predictor-flags'

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

// R1 first kickoff = winner-pick lock = tournament-locks-in time.
// Mirror src/lib/predictor-session.ts WINNER_PICK_LOCK_ISO.
const ROUND_1_LOCK_ISO = '2026-06-11T19:00:00.000Z'

// Round metadata. Lock ISOs are placeholders until the actual schedule is
// finalized — we read real first-kickoff times from /api/predictor/round/{code}.
const ROUND_META: { code: string; label: string; sub: string; order: number }[] = [
  { code: 'group_r1', label: 'Round 1', sub: 'Group Stage 1',       order: 1 },
  { code: 'group_r2', label: 'Round 2', sub: 'Group Stage 2',       order: 2 },
  { code: 'group_r3', label: 'Round 3', sub: 'Group Stage 3',       order: 3 },
  { code: 'r32',      label: 'Round 4', sub: 'Round of 32',         order: 4 },
  { code: 'r16',      label: 'Round 5', sub: 'Round of 16',         order: 5 },
  { code: 'qf',       label: 'Round 6', sub: 'Quarterfinals',       order: 6 },
  { code: 'sf',       label: 'Round 7', sub: 'Semifinals',          order: 7 },
  { code: 'final',    label: 'Round 8', sub: 'Final & 3rd Place',   order: 8 },
]

interface RoundStatus {
  code: string
  lockAt: string | null
  locked: boolean
  myPicks: number
  matchCount: number
}

interface LeaderboardRow {
  rank: number
  profile_id: string
  manager_name: string
  first_name: string
  total: number
}

interface MyLeague {
  id: string
  name: string
  invite_code: string
  member_count: number
  my_rank: number
  is_admin: boolean
}

interface MeProfile { id: string; manager_name: string; first_name: string }

export default function PredictorHome() {
  const router = useRouter()
  const [now, setNow] = useState(() => new Date())
  const [me, setMe] = useState<MeProfile | null>(null)
  const [winnerPick, setWinnerPick] = useState<string | null>(null)
  const [rounds, setRounds] = useState<RoundStatus[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [myLeagues, setMyLeagues] = useState<MyLeague[]>([])
  const [leaguesLoaded, setLeaguesLoaded] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auth probe
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (cancelled || !j?.profile) return
        setMe({
          id: j.profile.id,
          manager_name: j.profile.manager_name ?? j.profile.first_name ?? 'Manager',
          first_name: j.profile.first_name ?? '',
        })
      } catch { /* anon */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Winner pick (authed only)
  useEffect(() => {
    if (!me) { setWinnerPick(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/predictor/winner', { credentials: 'include', cache: 'no-store' })
        const j = await r.json().catch(() => null)
        if (!cancelled) setWinnerPick(j?.pick?.team_code ?? null)
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [me])

  // All 8 rounds: status + first kickoff. Fired in parallel.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const results = await Promise.all(ROUND_META.map(async (rm) => {
        try {
          const r = await fetch(`/api/predictor/round/${rm.code}`, {
            credentials: 'include',
            cache: 'no-store',
          })
          if (!r.ok) return { code: rm.code, lockAt: null, locked: false, myPicks: 0, matchCount: 0 }
          const j = await r.json()
          return {
            code: rm.code,
            lockAt: j.lock_at ?? null,
            locked: Boolean(j.locked),
            myPicks: Array.isArray(j.my_picks) ? j.my_picks.length : 0,
            matchCount: Array.isArray(j.matches) ? j.matches.length : 0,
          }
        } catch {
          return { code: rm.code, lockAt: null, locked: false, myPicks: 0, matchCount: 0 }
        }
      }))
      if (!cancelled) setRounds(results)
    })()
    return () => { cancelled = true }
  }, [me])

  // Global leaderboard
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/predictor/leaderboard?scope=global&limit=10', {
          credentials: 'include',
          cache: 'no-store',
        })
        const j = await r.json().catch(() => null)
        if (!cancelled) {
          setLeaderboard(j?.rows ?? [])
          setTotalPlayers(j?.total_players ?? 0)
        }
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [me])

  // My leagues
  const refreshLeagues = async () => {
    try {
      const r = await fetch('/api/predictor/leagues/mine', {
        credentials: 'include',
        cache: 'no-store',
      })
      const j = await r.json().catch(() => null)
      setMyLeagues(j?.leagues ?? [])
    } catch { /* */ } finally {
      setLeaguesLoaded(true)
    }
  }
  useEffect(() => {
    if (!me) { setMyLeagues([]); setLeaguesLoaded(true); return }
    refreshLeagues()
  }, [me])

  const lockMs = useMemo(() => new Date(ROUND_1_LOCK_ISO).getTime(), [])
  const r1Locked = now.getTime() >= lockMs
  const countdown = formatCountdown(lockMs - now.getTime())

  return (
    <>
      <AuthHeader />
      <main style={{ maxWidth: 880, margin: '0 auto', padding: '2rem 1.1rem 5rem' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <h1 style={{
            fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
            fontWeight: 900,
            color: C.gold,
            margin: '0 0 0.35rem',
            letterSpacing: '-0.02em',
          }}>Score Predictor</h1>
          <p style={{ color: C.muted, fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
            Predict every match. Star your bangers. Climb the leaderboard.
            <br />Free to play · 8 stars · 104 matches · 1 World Cup
          </p>

          {/* Stacked countdown chips */}
          {r1Locked ? (
            <div style={chipStyle('locked')}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.muted }} />
              <span>Round 1 locked — winner pick locked</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={chipStyle('primary')}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.gold }} />
                <span>Round 1 locks in {countdown}</span>
              </div>
              <div style={chipStyle('secondary')}>
                <span>Tournament winner locks at the same time</span>
              </div>
            </div>
          )}
        </div>

        {/* Global Leaderboard + My Leagues 2-up */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.25rem',
        }}>
          <LeaderboardCard rows={leaderboard} totalPlayers={totalPlayers} meId={me?.id ?? null} />
          <MyLeaguesCard
            leagues={myLeagues}
            loaded={leaguesLoaded}
            authed={Boolean(me)}
            onCreate={() => setCreateOpen(true)}
            onJoin={() => setJoinOpen(true)}
          />
        </section>

        {/* Tournament winner card */}
        <WinnerCard winnerPick={winnerPick} locked={r1Locked} authed={Boolean(me)} />

        {/* 8-round list */}
        <section style={{ marginTop: '1rem' }}>
          <h2 style={{
            color: C.gold,
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            margin: '0 0 0.6rem',
            padding: '0 0.25rem',
          }}>Rounds</h2>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {ROUND_META.map((rm) => {
              const st = rounds.find((r) => r.code === rm.code)
              return (
                <RoundRow
                  key={rm.code}
                  meta={rm}
                  status={st}
                  authed={Boolean(me)}
                  globalLockMs={lockMs}
                  now={now}
                />
              )
            })}
          </div>
        </section>

        {/* Anon nudge */}
        {!me && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem 1.25rem',
            backgroundColor: 'rgba(0,230,118,0.06)',
            border: '1px solid rgba(0,230,118,0.2)',
            borderRadius: '0.75rem',
            textAlign: 'center',
          }}>
            <p style={{ color: C.text, margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
              You&apos;re browsing as a guest. Picks save once you sign in.
            </p>
            <span style={{ color: C.green, fontWeight: 700, fontSize: '0.8rem' }}>
              Use the Sign In button up top to play.
            </span>
          </div>
        )}
      </main>

      {createOpen && (
        <CreateLeagueModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false)
            router.push(`/predictor/leagues/${id}`)
          }}
        />
      )}
      {joinOpen && (
        <JoinLeagueModal
          onClose={() => setJoinOpen(false)}
          onJoined={(id) => {
            setJoinOpen(false)
            refreshLeagues()
            router.push(`/predictor/leagues/${id}`)
          }}
        />
      )}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function LeaderboardCard({ rows, totalPlayers, meId }: { rows: LeaderboardRow[]; totalPlayers: number; meId: string | null }) {
  return (
    <div style={cardOuterStyle}>
      <div style={cardHeaderStyle}>
        <span>Global Leaderboard</span>
        <Link
          href="/predictor/scoring"
          style={{ color: C.gold, fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none' }}
        >Scoring →</Link>
      </div>
      {rows.length === 0 ? (
        <p style={{ color: C.muted, fontSize: '0.82rem', margin: '0.4rem 0 0', lineHeight: 1.4 }}>
          Leaderboard lights up once matches start going final.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.4rem' }}>
          {rows.map((row) => (
            <div key={row.profile_id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.4rem 0.55rem',
              backgroundColor: row.profile_id === meId ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${row.profile_id === meId ? 'rgba(251,191,36,0.3)' : C.borderSoft}`,
              borderRadius: '0.4rem',
            }}>
              <span style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, width: 22 }}>#{row.rank}</span>
              <span style={{
                flex: 1,
                color: row.profile_id === meId ? C.gold : C.text,
                fontSize: '0.8rem',
                fontWeight: row.profile_id === meId ? 700 : 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{row.manager_name}</span>
              <span style={{ color: C.gold, fontSize: '0.78rem', fontWeight: 800 }}>{row.total}</span>
            </div>
          ))}
        </div>
      )}
      {totalPlayers > rows.length && (
        <div style={{ color: C.muted, fontSize: '0.7rem', textAlign: 'center', marginTop: '0.45rem' }}>
          {totalPlayers} player{totalPlayers === 1 ? '' : 's'} playing
        </div>
      )}
    </div>
  )
}

function MyLeaguesCard({ leagues, loaded, authed, onCreate, onJoin }: {
  leagues: MyLeague[]
  loaded: boolean
  authed: boolean
  onCreate: () => void
  onJoin: () => void
}) {
  return (
    <div style={cardOuterStyle}>
      <div style={cardHeaderStyle}>
        <span>My Leagues</span>
        <span style={{ color: C.muted, fontSize: '0.7rem' }}>{leagues.length} joined</span>
      </div>
      {!authed && (
        <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0.4rem 0 0.75rem', lineHeight: 1.4 }}>
          Sign in to create a private league with friends.
        </p>
      )}
      {authed && loaded && leagues.length === 0 && (
        <p style={{ color: C.muted, fontSize: '0.8rem', margin: '0.4rem 0 0.75rem', lineHeight: 1.4 }}>
          No leagues yet. Create one or join with an invite code.
        </p>
      )}
      {authed && leagues.length > 0 && (
        <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.4rem' }}>
          {leagues.slice(0, 5).map((lg) => (
            <Link
              key={lg.id}
              href={`/predictor/leagues/${lg.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.5rem 0.6rem',
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: `1px solid ${C.borderSoft}`,
                borderRadius: '0.45rem',
                textDecoration: 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lg.name}</div>
                <div style={{ color: C.muted, fontSize: '0.7rem' }}>
                  {lg.member_count} member{lg.member_count === 1 ? '' : 's'} · #{lg.my_rank}
                  {lg.is_admin && <span style={{ color: C.gold, marginLeft: '0.4rem' }}>admin</span>}
                </div>
              </div>
              <span style={{ color: C.muted, fontSize: '0.85rem' }}>›</span>
            </Link>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.7rem' }}>
        <button
          onClick={onCreate}
          disabled={!authed}
          style={{
            flex: 1,
            backgroundColor: authed ? C.gold : '#2a3550',
            color: authed ? '#0A0F2E' : C.muted,
            border: 'none',
            borderRadius: '0.4rem',
            padding: '0.5rem',
            fontWeight: 800,
            fontSize: '0.78rem',
            cursor: authed ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >Create league</button>
        <button
          onClick={onJoin}
          disabled={!authed}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            color: authed ? C.text : C.muted,
            border: `1px solid ${C.border}`,
            borderRadius: '0.4rem',
            padding: '0.5rem',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: authed ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >Join with code</button>
      </div>
    </div>
  )
}

function WinnerCard({ winnerPick, locked, authed }: { winnerPick: string | null; locked: boolean; authed: boolean }) {
  return (
    <Link href="/predictor/winner" style={{ textDecoration: 'none' }}>
      <div style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '0.9rem',
        padding: '1.1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: '1.02rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
            Pick the Tournament Winner
          </div>
          <div style={{ color: C.muted, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', lineHeight: 1.4 }}>
            {winnerPick ? (
              <>
                <span>Your pick:</span>
                <img
                  src={flagUrl(winnerPick)}
                  alt=""
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  style={{ width: 18, height: 12, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                />
                <strong style={{ color: C.text }}>{winnerPick}</strong>
                {!locked && <span style={{ color: C.muted, fontSize: '0.75rem' }}>· tap to change</span>}
              </>
            ) : locked ? (
              <span>Pick window closed.</span>
            ) : authed ? (
              <span>Pick one team to lift the trophy. Worth 40 pts if you nail it.</span>
            ) : (
              <span>Sign in to lock your champion.</span>
            )}
          </div>
        </div>
        <div style={badgeStyle(
          locked ? 'locked' : (winnerPick ? 'submitted' : 'open')
        )}>{locked ? 'Locked' : (winnerPick ? 'Submitted' : 'Open')}</div>
      </div>
    </Link>
  )
}

function RoundRow({ meta, status, authed, globalLockMs, now }: {
  meta: { code: string; label: string; sub: string; order: number }
  status: RoundStatus | undefined
  authed: boolean
  globalLockMs: number
  now: Date
}) {
  // A round is "available" if its own lock-at exists. For Round 1 we always
  // route (it's the first round). For later rounds, route if the API returned
  // a lock_at — that means matches exist for that round.
  const hasMatches = status ? status.matchCount > 0 : false
  const available = hasMatches || meta.code === 'group_r1'
  const locked = Boolean(status?.locked)
  const lockMs = status?.lockAt ? new Date(status.lockAt).getTime() : null

  const submittedCount = status?.myPicks ?? 0
  const totalForCap = meta.code.startsWith('group_') ? 16 : (status?.matchCount ?? 0)

  let statusLabel = 'Coming soon'
  let statusColor = C.muted
  if (locked) {
    statusLabel = 'Locked'
    statusColor = C.muted
  } else if (available && authed && submittedCount > 0) {
    statusLabel = `In progress ${submittedCount}/${totalForCap || '?'}`
    statusColor = C.green
  } else if (available) {
    statusLabel = 'Open'
    statusColor = C.gold
  }

  // Pre-window rows: if no lock_at yet AND it's not round 1, fall back to the
  // global R1 lock as an "opens after R1" hint. (Actual round opens via the
  // pick screen even before matches go final.)
  const lockHint = locked
    ? 'Round locked'
    : lockMs
      ? `Locks ${formatLockDate(new Date(lockMs))}`
      : meta.order === 1
        ? `Locks in ${formatCountdown(globalLockMs - now.getTime())}`
        : 'Opens after Round 1'

  const inner = (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.85rem',
      padding: '0.7rem 0.85rem',
      backgroundColor: C.card,
      border: `1px solid ${available ? C.border : C.borderSoft}`,
      borderRadius: '0.7rem',
      opacity: available ? 1 : 0.55,
      textDecoration: 'none',
    }}>
      <div style={{
        flexShrink: 0,
        width: 38,
        height: 38,
        borderRadius: '50%',
        backgroundColor: 'rgba(251,191,36,0.08)',
        border: `1px solid ${available ? 'rgba(251,191,36,0.3)' : C.borderSoft}`,
        color: available ? C.gold : C.muted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: '0.9rem',
      }}>{meta.order}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.2 }}>
          {meta.label} <span style={{ color: C.muted, fontWeight: 500 }}>· {meta.sub}</span>
        </div>
        <div style={{ color: C.muted, fontSize: '0.72rem', marginTop: '0.2rem' }}>{lockHint}</div>
      </div>
      <div style={{
        flexShrink: 0,
        fontSize: '0.68rem',
        fontWeight: 700,
        color: statusColor,
        backgroundColor: 'rgba(255,255,255,0.04)',
        padding: '0.28rem 0.55rem',
        borderRadius: '0.42rem',
        border: `1px solid ${statusColor}33`,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}>{statusLabel}</div>
    </div>
  )

  if (!available) return inner
  return (
    <Link href={`/predictor/round/${meta.code}`} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Modals
// ────────────────────────────────────────────────────────────────────────────

function CreateLeagueModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/predictor/leagues/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        setErr(j?.error === 'unauthenticated' ? 'Sign in to create a league.' : (j?.error ?? 'Create failed.'))
        setBusy(false)
        return
      }
      onCreated(j.league_id)
    } catch {
      setErr('Network error.')
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Create a league" onClose={onClose}>
      <form onSubmit={submit}>
        <label style={modalLabelStyle}>League name</label>
        <input
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Group Chat World Cup"
          style={modalInputStyle}
        />
        {err && <div style={modalErrStyle}>{err}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={onClose} style={modalSecondaryBtn}>Cancel</button>
          <button type="submit" disabled={!name.trim() || busy} style={modalPrimaryBtn(Boolean(name.trim()) && !busy)}>
            {busy ? 'Creating…' : 'Create league'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function JoinLeagueModal({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/predictor/leagues/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: code.trim() }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        setErr(j?.error === 'league_not_found' ? 'Invite code not found.' : (j?.error ?? 'Join failed.'))
        setBusy(false)
        return
      }
      onJoined(j.league_id)
    } catch {
      setErr('Network error.')
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Join with code" onClose={onClose}>
      <form onSubmit={submit}>
        <label style={modalLabelStyle}>Invite code</label>
        <input
          autoFocus
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC234"
          style={{ ...modalInputStyle, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}
        />
        {err && <div style={modalErrStyle}>{err}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
          <button type="button" onClick={onClose} style={modalSecondaryBtn}>Cancel</button>
          <button type="submit" disabled={!code.trim() || busy} style={modalPrimaryBtn(Boolean(code.trim()) && !busy)}>
            {busy ? 'Joining…' : 'Join league'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '0.85rem',
          padding: '1.2rem 1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h2 style={{ color: C.gold, fontSize: '1rem', fontWeight: 800, margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '1.2rem', padding: 0, lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Styles + helpers
// ────────────────────────────────────────────────────────────────────────────

const cardOuterStyle: React.CSSProperties = {
  backgroundColor: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: '0.85rem',
  padding: '0.9rem 1rem 1rem',
  minWidth: 0,
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: C.gold,
  fontSize: '0.74rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const modalLabelStyle: React.CSSProperties = {
  display: 'block',
  color: C.muted,
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.4rem',
}

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.7rem',
  borderRadius: '0.5rem',
  border: `1px solid ${C.border}`,
  backgroundColor: '#0A0F2E',
  color: C.text,
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const modalErrStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  color: C.red,
  fontSize: '0.78rem',
}

function modalPrimaryBtn(enabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    backgroundColor: enabled ? C.green : '#2a3550',
    color: enabled ? '#0A0F2E' : C.muted,
    border: 'none',
    borderRadius: '0.45rem',
    padding: '0.55rem',
    fontWeight: 800,
    fontSize: '0.85rem',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
  }
}

const modalSecondaryBtn: React.CSSProperties = {
  flex: 1,
  backgroundColor: 'transparent',
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: '0.45rem',
  padding: '0.55rem',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function chipStyle(tone: 'primary' | 'secondary' | 'locked'): React.CSSProperties {
  const palette = {
    primary: {
      bg: 'rgba(251,191,36,0.08)',
      border: 'rgba(251,191,36,0.3)',
      color: C.gold,
    },
    secondary: {
      bg: 'rgba(251,191,36,0.04)',
      border: 'rgba(251,191,36,0.18)',
      color: '#cfa340',
    },
    locked: {
      bg: 'rgba(136,153,204,0.08)',
      border: '#2a3550',
      color: C.muted,
    },
  }[tone]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: palette.bg,
    border: `1px solid ${palette.border}`,
    borderRadius: '2rem',
    padding: '0.35rem 0.95rem',
    color: palette.color,
    fontSize: '0.72rem',
    fontWeight: 700,
  }
}

function badgeStyle(kind: 'locked' | 'submitted' | 'open'): React.CSSProperties {
  const c = kind === 'locked' ? C.muted : kind === 'submitted' ? C.green : C.gold
  return {
    flexShrink: 0,
    fontSize: '0.7rem',
    fontWeight: 700,
    color: c,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: '0.3rem 0.6rem',
    borderRadius: '0.5rem',
    border: `1px solid ${c}33`,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatLockDate(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' CT'
}
