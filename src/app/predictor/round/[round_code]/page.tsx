'use client'

/**
 * /predictor/round/[round_code]
 *
 * Phase 3 ships the full UI but the in-spec flow only exercises
 * round_code = 'group_r1' (Round 1). All 8 round codes are accepted by the
 * route so internal QA can preview other rounds; the actual gameplay flow
 * (counter cap, knockout if-draw picker) follows the spec.
 */

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flagUrl } from '@/lib/predictor-flags'
import AuthHeader from '@/components/AuthHeader'
import { selectStyle, SELECT_OPTION_CSS, PREDICTOR_ROUND_OPTIONS } from '@/lib/select-style'

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

const GROUP_ROUNDS = new Set(['group_r1', 'group_r2', 'group_r3'])
// Stars now apply to R1–R4 only (group stages + R32). R5–R8 use the
// Anytime Goalscorer pick instead. See PREDICTOR-WAVE-C-AMEND-GOALSCORER.md.
const STAR_ROUNDS = new Set(['group_r1', 'group_r2', 'group_r3', 'r32'])
const GOALSCORER_ROUNDS = new Set(['r16', 'qf', 'sf', 'final'])
const ROUND_LABEL: Record<string, string> = {
  group_r1: 'Round 1 — Group Stage 1',
  group_r2: 'Round 2 — Group Stage 2',
  group_r3: 'Round 3 — Group Stage 3',
  r32: 'Round 4 — Round of 32',
  r16: 'Round 5 — Round of 16',
  qf: 'Round 6 — Quarterfinals',
  sf: 'Round 7 — Semifinals',
  final: 'Round 8 — Final & 3rd Place',
}
const ROUND_EXPECTED: Record<string, number> = {
  group_r1: 24, group_r2: 24, group_r3: 24,
  r32: 16, r16: 8, qf: 4, sf: 2, final: 2,
}

interface PredictorMatch {
  id: string
  match_num: number
  round_code: string
  group_code: string | null
  home_team_code: string
  away_team_code: string
  kickoff_at: string
  venue: string | null
  status: string
  is_knockout: boolean
}

interface GoalscorerPlayer {
  id: string
  name: string | null
  short_name: string | null
  last_name: string | null
  nationality: string | null
}

interface PickState {
  home: string  // string so empty input is valid
  away: string
  is_star: boolean
  if_draw_winner: string | null
  goalscorer_player_id: string | null
  goalscorer_team_code: string | null
  goalscorer_player: GoalscorerPlayer | null
  dirty: boolean
}

export default function RoundPicksPage({
  params,
}: {
  params: Promise<{ round_code: string }>
}) {
  const { round_code } = use(params)
  const router = useRouter()

  const isKnockout = !GROUP_ROUNDS.has(round_code)
  const hasStars = STAR_ROUNDS.has(round_code)
  const hasGoalscorer = GOALSCORER_ROUNDS.has(round_code)
  const label = ROUND_LABEL[round_code] || round_code

  const [matches, setMatches] = useState<PredictorMatch[]>([])
  const [picks, setPicks] = useState<Record<string, PickState>>({})
  const [lockAt, setLockAt] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/predictor/round/${round_code}`, { credentials: 'include' })
        if (!r.ok) return
        const j = await r.json()
        if (cancelled) return
        setMatches(j.matches || [])
        setLockAt(j.lock_at || null)
        setLocked(Boolean(j.locked))
        const initial: Record<string, PickState> = {}
        for (const p of j.my_picks || []) {
          initial[p.match_id] = {
            home: String(p.home_score),
            away: String(p.away_score),
            is_star: Boolean(p.is_star),
            if_draw_winner: p.if_draw_winner ?? null,
            goalscorer_player_id: p.goalscorer_player_id ?? null,
            goalscorer_team_code: p.goalscorer_team_code ?? null,
            goalscorer_player: p.goalscorer_player ?? null,
            dirty: false,
          }
        }
        setPicks(initial)
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [round_code])

  const lockMs = lockAt ? new Date(lockAt).getTime() : null
  const countdown = useMemo(
    () => lockMs ? formatCountdown(lockMs - now.getTime()) : '',
    [lockMs, now]
  )

  const filledPicks = useMemo(
    () => Object.entries(picks).filter(([, p]) => p.home !== '' && p.away !== ''),
    [picks]
  )
  const starCount = filledPicks.filter(([, p]) => p.is_star).length

  // Validations
  const capForGroup = 16
  const expected = ROUND_EXPECTED[round_code] ?? 0
  const tooManyGroup = !isKnockout && filledPicks.length > capForGroup
  const tooManyStars = hasStars && starCount > 1
  const knockoutShort = isKnockout && filledPicks.length !== expected
  const drawNeedsWinner = isKnockout && filledPicks.some(([, p]) =>
    p.home === p.away && !p.if_draw_winner
  )

  const canSubmit = !locked && filledPicks.length > 0 && !tooManyGroup && !tooManyStars && !knockoutShort && !drawNeedsWinner

  function setPick(matchId: string, patch: Partial<PickState>) {
    setPicks((cur) => ({
      ...cur,
      [matchId]: {
        home: cur[matchId]?.home ?? '',
        away: cur[matchId]?.away ?? '',
        is_star: cur[matchId]?.is_star ?? false,
        if_draw_winner: cur[matchId]?.if_draw_winner ?? null,
        goalscorer_player_id: cur[matchId]?.goalscorer_player_id ?? null,
        goalscorer_team_code: cur[matchId]?.goalscorer_team_code ?? null,
        goalscorer_player: cur[matchId]?.goalscorer_player ?? null,
        ...patch,
        dirty: true,
      },
    }))
  }

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true); setMsg(null)
    try {
      const payload = {
        round_code,
        picks: filledPicks.map(([match_id, p]) => ({
          match_id,
          home_score: parseInt(p.home, 10),
          away_score: parseInt(p.away, 10),
          if_draw_winner: p.if_draw_winner,
          is_star: p.is_star,
        })),
      }
      const r = await fetch('/api/predictor/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 401) {
        setMsg({ kind: 'err', text: 'Sign in to save your picks.' })
      } else if (r.status === 403) {
        setMsg({ kind: 'err', text: 'This round is locked.' })
        setLocked(true)
      } else if (!r.ok) {
        setMsg({ kind: 'err', text: j?.error || 'Save failed.' })
      } else {
        // mark all as not-dirty
        setPicks((cur) => Object.fromEntries(Object.entries(cur).map(
          ([k, v]) => [k, { ...v, dirty: false }]
        )))
        setMsg({ kind: 'ok', text: `Saved ${j.saved_count} pick${j.saved_count === 1 ? '' : 's'}.` })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <AuthHeader />
    <style>{SELECT_OPTION_CSS}</style>
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '1.5rem 0.75rem 7rem', overflowX: 'hidden' }}>
      {/* Round nav strip — Home button + round dropdown (mirrors /scores) */}
      <div style={{
        display: 'flex',
        gap: '0.6rem',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}>
        <Link
          href="/predictor"
          style={{
            ...selectStyle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            textDecoration: 'none',
            backgroundImage: 'none',
            padding: '0.45rem 0.85rem',
          }}
        >
          <span aria-hidden="true">←</span> Home
        </Link>
        <select
          value={round_code}
          onChange={(e) => router.push(`/predictor/round/${e.target.value}`)}
          style={selectStyle}
          aria-label="Choose round"
        >
          {PREDICTOR_ROUND_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{
          fontSize: 'clamp(1.5rem, 4vw, 1.9rem)',
          fontWeight: 900,
          color: C.gold,
          margin: '0 0 0.3rem',
        }}>{label}</h1>
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0 }}>
          {isKnockout
            ? `Pick every match (${expected} total). 1 star allowed.`
            : `Pick up to 16 of 24 matches. 1 star allowed.`}
        </p>
      </div>

      {/* Sticky counters + lock */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        marginBottom: '1rem',
        padding: '0.6rem 0.9rem',
        borderRadius: '0.6rem',
        backgroundColor: locked ? 'rgba(136,153,204,0.08)' : 'rgba(251,191,36,0.08)',
        border: `1px solid ${locked ? '#2a3550' : 'rgba(251,191,36,0.3)'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        fontSize: '0.78rem',
        fontWeight: 700,
      }}>
        <span style={{ color: C.text }}>
          Picks: <span style={{ color: tooManyGroup ? C.red : C.green }}>{filledPicks.length}{!isKnockout ? `/${capForGroup}` : `/${expected}`}</span>
          {hasStars && (
            <>
              {' · '}
              Stars: <span style={{ color: tooManyStars ? C.red : C.green }}>{starCount}/1</span>
            </>
          )}
        </span>
        <span style={{ color: locked ? C.muted : C.gold }}>
          {locked ? 'Round locked' : `Locks in ${countdown}`}
        </span>
      </div>

      {/* Matches */}
      {matches.length === 0 && (
        <div style={{ color: C.muted, textAlign: 'center', padding: '2rem 0' }}>Loading matches…</div>
      )}
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {matches.map((mt) => {
          const pick = picks[mt.id] || {
            home: '',
            away: '',
            is_star: false,
            if_draw_winner: null,
            goalscorer_player_id: null,
            goalscorer_team_code: null,
            goalscorer_player: null,
            dirty: false,
          }
          const isDraw = pick.home !== '' && pick.home === pick.away
          const drawNeedsPick = isKnockout && isDraw && !pick.if_draw_winner
          return (
            <MatchCard
              key={mt.id}
              match={mt}
              pick={pick}
              isKnockout={isKnockout}
              hasStars={hasStars}
              hasGoalscorer={hasGoalscorer}
              locked={locked}
              drawNeedsPick={drawNeedsPick}
              onChange={(patch) => setPick(mt.id, patch)}
              onGoalscorerSaved={(g) => setPick(mt.id, { ...g, dirty: false })}
            />
          )
        })}
      </div>

      {/* Sticky submit */}
      {!locked && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(10,15,46,0.97)',
          borderTop: `1px solid ${C.border}`,
          padding: '0.9rem 1rem 1.1rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: C.muted, fontSize: '0.78rem' }}>
            {tooManyGroup && <span style={{ color: C.red }}>{filledPicks.length}/16 — drop {filledPicks.length - 16}</span>}
            {tooManyStars && <span style={{ color: C.red }}> · Too many stars</span>}
            {knockoutShort && <span style={{ color: C.red }}>Pick all {expected} matches</span>}
            {drawNeedsWinner && <span style={{ color: C.red }}>Choose draw advancer</span>}
            {canSubmit && <span>Ready to submit {filledPicks.length} pick{filledPicks.length === 1 ? '' : 's'}</span>}
            {!canSubmit && filledPicks.length === 0 && <span>No picks yet</span>}
          </span>
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            style={{
              backgroundColor: canSubmit && !busy ? C.green : '#2a3550',
              color: canSubmit && !busy ? '#0A0F2E' : C.muted,
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.6rem 1.2rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: canSubmit && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Saving…' : 'Submit Round'}
          </button>
        </div>
      )}

      {msg && (
        <div style={{
          position: 'fixed',
          bottom: '5.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: msg.kind === 'ok' ? 'rgba(0,230,118,0.12)' : 'rgba(248,113,113,0.12)',
          color: msg.kind === 'ok' ? C.green : C.red,
          border: `1px solid ${msg.kind === 'ok' ? C.green : C.red}`,
          borderRadius: '0.5rem',
          padding: '0.4rem 0.9rem',
          fontSize: '0.78rem',
          fontWeight: 700,
        }}>{msg.text}</div>
      )}
    </main>
    </>
  )
}

function MatchCard({
  match, pick, isKnockout, hasStars, hasGoalscorer, locked, drawNeedsPick, onChange, onGoalscorerSaved,
}: {
  match: PredictorMatch
  pick: PickState
  isKnockout: boolean
  hasStars: boolean
  hasGoalscorer: boolean
  locked: boolean
  drawNeedsPick: boolean
  onChange: (patch: Partial<PickState>) => void
  onGoalscorerSaved: (g: Partial<PickState>) => void
}) {
  const isDraw = pick.home !== '' && pick.home === pick.away
  const koDate = new Date(match.kickoff_at)
  const dateStr = koDate.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${pick.is_star ? '#FBBF2466' : (drawNeedsPick ? '#F8717166' : C.borderSoft)}`,
      borderRadius: '0.75rem',
      padding: '0.85rem 0.75rem',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.7rem', color: C.muted }}>
        <span>Match {match.match_num} · {dateStr} CT</span>
        {hasStars && (
          <button
            onClick={() => !locked && onChange({ is_star: !pick.is_star })}
            disabled={locked}
            style={{
              background: 'none',
              border: 'none',
              cursor: locked ? 'default' : 'pointer',
              color: pick.is_star ? C.gold : '#2a3550',
              fontSize: '1.15rem',
              padding: 0,
            }}
            aria-label="Toggle star"
          >★</button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
        <TeamSide team={match.home_team_code} align="right" />
        <ScoreInput value={pick.home} onChange={(v) => !locked && onChange({ home: v })} disabled={locked} />
        <span style={{ color: C.muted, fontSize: '0.85rem', flexShrink: 0 }}>–</span>
        <ScoreInput value={pick.away} onChange={(v) => !locked && onChange({ away: v })} disabled={locked} />
        <TeamSide team={match.away_team_code} align="left" />
      </div>
      {isKnockout && isDraw && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.5rem 0.7rem',
          borderRadius: '0.4rem',
          backgroundColor: 'rgba(248,113,113,0.06)',
          border: `1px solid ${pick.if_draw_winner ? '#2a3550' : '#F8717155'}`,
        }}>
          <div style={{ color: C.muted, fontSize: '0.72rem', marginBottom: '0.4rem', fontWeight: 700 }}>
            If draw at 90, who advances?
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[match.home_team_code, match.away_team_code].map((tc) => (
              <button
                key={tc}
                onClick={() => !locked && onChange({ if_draw_winner: tc })}
                disabled={locked}
                style={{
                  flex: 1,
                  backgroundColor: pick.if_draw_winner === tc ? 'rgba(0,230,118,0.15)' : '#0A0F2E',
                  border: `1px solid ${pick.if_draw_winner === tc ? C.green : C.borderSoft}`,
                  borderRadius: '0.35rem',
                  padding: '0.35rem',
                  color: C.text,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: locked ? 'default' : 'pointer',
                }}
              >{tc}</button>
            ))}
          </div>
        </div>
      )}
      {hasGoalscorer && (
        <GoalscorerSection
          match={match}
          pick={pick}
          locked={locked}
          onSaved={onGoalscorerSaved}
        />
      )}
    </div>
  )
}

function GoalscorerSection({
  match, pick, locked, onSaved,
}: {
  match: PredictorMatch
  pick: PickState
  locked: boolean
  onSaved: (g: Partial<PickState>) => void
}) {
  const saved = Boolean(pick.goalscorer_player_id && pick.goalscorer_team_code)
  const [editing, setEditing] = useState(false)
  const open = !saved || editing

  const [selTeam, setSelTeam] = useState<string>(pick.goalscorer_team_code ?? '')
  const [selPlayer, setSelPlayer] = useState<string>(pick.goalscorer_player_id ?? '')
  const [players, setPlayers] = useState<GoalscorerPlayer[] | null>(null)
  const [loadingPlayers, setLoadingPlayers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Sync selTeam / selPlayer if the saved pick changes from above (e.g. round
  // page re-fetch after another save).
  useEffect(() => {
    setSelTeam(pick.goalscorer_team_code ?? '')
    setSelPlayer(pick.goalscorer_player_id ?? '')
  }, [pick.goalscorer_team_code, pick.goalscorer_player_id])

  // Fetch squad whenever team changes.
  useEffect(() => {
    if (!selTeam) { setPlayers(null); return }
    let cancelled = false
    setLoadingPlayers(true)
    ;(async () => {
      try {
        const r = await fetch(`/api/predictor/players?team_code=${encodeURIComponent(selTeam)}`, { credentials: 'include' })
        const j = await r.json().catch(() => null)
        if (cancelled) return
        setPlayers((j?.players ?? []) as GoalscorerPlayer[])
      } catch {
        if (!cancelled) setPlayers([])
      } finally {
        if (!cancelled) setLoadingPlayers(false)
      }
    })()
    return () => { cancelled = true }
  }, [selTeam])

  // Reset player selection if team changes and current player isn't on the new squad.
  useEffect(() => {
    if (!players) return
    if (selPlayer && !players.some((p) => p.id === selPlayer)) {
      setSelPlayer('')
    }
  }, [players, selPlayer])

  const canSave = !locked && !busy && Boolean(selTeam && selPlayer) && (
    selPlayer !== pick.goalscorer_player_id || selTeam !== pick.goalscorer_team_code
  )

  async function save() {
    if (!canSave) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/predictor/picks/goalscorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          match_id: match.id,
          team_code: selTeam,
          player_id: selPlayer,
        }),
      })
      const j = await r.json().catch(() => null)
      if (r.status === 401) {
        setErr('Sign in to save your goalscorer pick.')
      } else if (r.status === 403) {
        setErr('Round is locked.')
      } else if (!r.ok) {
        setErr(j?.error || 'Save failed.')
      } else {
        const found = (players ?? []).find((p) => p.id === selPlayer) ?? null
        onSaved({
          goalscorer_player_id: selPlayer,
          goalscorer_team_code: selTeam,
          goalscorer_player: found,
        })
        setEditing(false)
      }
    } catch {
      setErr('Network error.')
    } finally {
      setBusy(false)
    }
  }

  const chipName = pick.goalscorer_player?.short_name
    || pick.goalscorer_player?.name
    || pick.goalscorer_player?.last_name
    || 'Player'

  return (
    <div style={{
      marginTop: '0.6rem',
      padding: '0.55rem 0.7rem',
      borderRadius: '0.4rem',
      backgroundColor: 'rgba(251,191,36,0.05)',
      border: `1px solid ${saved && !editing ? '#2a3550' : 'rgba(251,191,36,0.25)'}`,
    }}>
      <div style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        Anytime Goalscorer
      </div>
      {!open && saved && (
        <button
          type="button"
          onClick={() => !locked && setEditing(true)}
          disabled={locked}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(0,230,118,0.10)',
            border: `1px solid ${C.green}`,
            color: C.text,
            borderRadius: '999px',
            padding: '0.3rem 0.7rem',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: locked ? 'default' : 'pointer',
          }}
          aria-label="Change goalscorer pick"
        >
          <span aria-hidden="true">⚽</span>
          <span>{chipName}</span>
          <span style={{ color: C.muted, fontWeight: 600 }}>({pick.goalscorer_team_code})</span>
          {!locked && <span style={{ color: C.muted, fontWeight: 500, fontSize: '0.7rem' }}>· tap to change</span>}
        </button>
      )}
      {open && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={selTeam}
              onChange={(e) => setSelTeam(e.target.value)}
              disabled={locked}
              style={{ ...selectStyle, flex: '1 1 140px', minWidth: 120 }}
              aria-label="Select team"
            >
              <option value="">Select team</option>
              <option value={match.home_team_code}>{match.home_team_code}</option>
              <option value={match.away_team_code}>{match.away_team_code}</option>
            </select>
            <select
              value={selPlayer}
              onChange={(e) => setSelPlayer(e.target.value)}
              disabled={locked || !selTeam || loadingPlayers}
              style={{ ...selectStyle, flex: '2 1 200px', minWidth: 160 }}
              aria-label="Select player"
            >
              <option value="">
                {!selTeam ? 'Pick team first' : loadingPlayers ? 'Loading…' : (players && players.length === 0 ? 'No players available' : 'Select player')}
              </option>
              {(players ?? []).map((pl) => {
                const label = pl.short_name || pl.name || pl.last_name || pl.id
                return <option key={pl.id} value={pl.id}>{label}</option>
              })}
            </select>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              style={{
                backgroundColor: canSave ? C.gold : '#2a3550',
                color: canSave ? '#0A0F2E' : C.muted,
                border: 'none',
                borderRadius: '0.4rem',
                padding: '0.42rem 0.85rem',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: canSave ? 'pointer' : 'default',
              }}
            >{busy ? 'Saving…' : 'Save'}</button>
          </div>
          {err && <div style={{ color: C.red, fontSize: '0.72rem' }}>{err}</div>}
          {saved && editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setSelTeam(pick.goalscorer_team_code ?? '')
                setSelPlayer(pick.goalscorer_player_id ?? '')
                setErr(null)
              }}
              style={{
                alignSelf: 'flex-start',
                background: 'none',
                border: 'none',
                color: C.muted,
                fontSize: '0.72rem',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >Cancel</button>
          )}
        </div>
      )}
    </div>
  )
}

function TeamSide({ team, align }: { team: string; align: 'left' | 'right' }) {
  // Try a flag; for placeholder strings like "Winner M73" the flag URL 404s,
  // which renders an empty <img>. We hide it via onError.
  // Use a short, abbreviated label on narrow viewports so long names like
  // "South Africa" or "Bosnia & Herzegovina" don't blow out the card on iPhone.
  return (
    <div style={{
      flex: '1 1 0',
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      gap: '0.4rem',
      overflow: 'hidden',
    }}>
      {align === 'right' && (
        <span style={{
          color: C.text,
          fontSize: '0.82rem',
          fontWeight: 600,
          textAlign: 'right',
          minWidth: 0,
          flex: '0 1 auto',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{team}</span>
      )}
      <img
        src={flagUrl(team)}
        alt=""
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        style={{ width: 20, height: 13, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
      />
      {align === 'left' && (
        <span style={{
          color: C.text,
          fontSize: '0.82rem',
          fontWeight: 600,
          minWidth: 0,
          flex: '0 1 auto',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{team}</span>
      )}
    </div>
  )
}

function ScoreInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={15}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange('')
        const n = parseInt(raw, 10)
        if (Number.isNaN(n) || n < 0) return
        if (n > 15) return onChange('15')
        onChange(String(n))
      }}
      style={{
        width: 40,
        textAlign: 'center',
        padding: '0.4rem 0.2rem',
        borderRadius: '0.35rem',
        border: `1px solid ${C.border}`,
        backgroundColor: '#0A0F2E',
        color: C.text,
        fontSize: '0.95rem',
        fontWeight: 700,
        appearance: 'textfield',
        MozAppearance: 'textfield',
      }}
    />
  )
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
