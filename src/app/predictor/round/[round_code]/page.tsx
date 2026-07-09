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
  teal: '#22D3EE',
}

// Result outcome -> color band used on finalized match cards. Mirrors the
// `outcome_color` value computed by the scoring engine (src/lib/predictor/scoring.ts)
// and stored as a generated column in predictor_scores.
const OUTCOME_BORDER: Record<'teal' | 'green' | 'red' | 'gray', string> = {
  teal: '#22D3EE',
  green: '#00E676',
  red: '#F87171',
  gray: '#2a3550',
}
const OUTCOME_BG: Record<'teal' | 'green' | 'red' | 'gray', string> = {
  teal: 'rgba(34,211,238,0.10)',
  green: 'rgba(0,230,118,0.08)',
  red: 'rgba(248,113,113,0.07)',
  gray: 'rgba(136,153,204,0.05)',
}
const OUTCOME_LABEL: Record<'teal' | 'green' | 'red' | 'gray', string> = {
  teal: 'Exact!',
  green: 'Result',
  red: 'Miss',
  gray: 'No pick',
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
  // Final result fields (null until match finalizes). When non-null, the card
  // renders post-match result + color band + points.
  home_score: number | null
  away_score: number | null
  went_to_pks: boolean | null
  pk_winner_team_code: string | null
  goalscorers: unknown
}

interface ScoreBreakdown {
  exact_pts: number
  result_pts: number
  scorer_pts: number
  star_multiplier: number
  total_pts: number
  outcome_color: 'teal' | 'green' | 'red' | 'gray'
}

interface GoalscorerPlayer {
  id: string
  name: string | null
  short_name: string | null
  last_name: string | null
  nationality: string | null
  /** Tournament goals scored so far (populated for R16+). */
  goals?: number
  /** Minutes played so far this tournament (populated for R16+). */
  mins?: number
}

interface PickState {
  home: string  // string so empty input is valid
  away: string
  is_star: boolean
  if_draw_winner: string | null
  goalscorer_player_id: string | null
  goalscorer_team_code: string | null
  goalscorer_player: GoalscorerPlayer | null
  // Scoreline / winner / star / if_draw_winner changes not yet POSTed.
  dirty: boolean
  // Goalscorer selection differs from the server-persisted value for this
  // match. Flushed by the single "Submit Round" button in the parent.
  goalscorer_dirty: boolean
}

interface PersistedGoalscorer {
  team_code: string
  player_id: string
  player: GoalscorerPlayer | null
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
  // Match ids that exist as rows in predictor_picks server-side. Updated
  // on initial fetch and after every successful save/clear. Drives whether
  // "clear" hits the DELETE endpoint or is a local-only state wipe.
  const [persistedIds, setPersistedIds] = useState<Set<string>>(new Set())
  // Snapshot of the server-persisted goalscorer per match. Keyed by match.id.
  // Present only when the user has a saved goalscorer server-side. Used to
  // (a) detect goalscorer dirtiness by comparing to current pick state, and
  // (b) let "Cancel" in the picker revert to the last persisted value.
  const [persistedGoalscorers, setPersistedGoalscorers] = useState<Record<string, PersistedGoalscorer>>({})
  const [clearing, setClearing] = useState<Set<string>>(new Set())
  // Per-match score breakdown for this profile. Populated only for matches
  // that have been scored by /api/predictor/score-match (status='final' +
  // recompute ran). Keyed by match.id.
  const [scores, setScores] = useState<Record<string, ScoreBreakdown>>({})
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
        setScores((j.my_scores || {}) as Record<string, ScoreBreakdown>)
        const initial: Record<string, PickState> = {}
        const initialGoalscorers: Record<string, PersistedGoalscorer> = {}
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
            goalscorer_dirty: false,
          }
          if (p.goalscorer_player_id && p.goalscorer_team_code) {
            initialGoalscorers[p.match_id] = {
              team_code: p.goalscorer_team_code,
              player_id: p.goalscorer_player_id,
              player: p.goalscorer_player ?? null,
            }
          }
        }
        setPicks(initial)
        setPersistedIds(new Set((j.my_picks || []).map((p: { match_id: string }) => p.match_id)))
        setPersistedGoalscorers(initialGoalscorers)
      } catch { /* */ }
    })()
    return () => { cancelled = true }
  }, [round_code])

  const lockMs = lockAt ? new Date(lockAt).getTime() : null
  const countdown = useMemo(
    () => lockMs ? formatCountdown(lockMs - now.getTime()) : '',
    [lockMs, now]
  )

  // Per-match kickoff lock map: a match is locked once its kickoff_at <= now.
  const matchLockedById = useMemo(() => {
    const map: Record<string, boolean> = {}
    const nowMs = now.getTime()
    for (const m of matches) {
      map[m.id] = new Date(m.kickoff_at).getTime() <= nowMs
    }
    return map
  }, [matches, now])
  const anyLocked = useMemo(
    () => Object.values(matchLockedById).some(Boolean),
    [matchLockedById]
  )

  const filledPicks = useMemo(
    () => Object.entries(picks).filter(([, p]) => p.home !== '' && p.away !== ''),
    [picks]
  )
  // Picks the user can actually submit on this save (locked matches are
  // read-only — keep them in `picks` for display but don't include them
  // in the POST payload).
  const submittablePicks = useMemo(
    () => filledPicks.filter(([matchId]) => !matchLockedById[matchId]),
    [filledPicks, matchLockedById]
  )
  const dirtyPicks = useMemo(
    () => submittablePicks.filter(([, p]) => p.dirty),
    [submittablePicks]
  )
  // Dirty goalscorer picks: match must be unlocked, must have both a team
  // and a player selected (partial in-progress selections don't get POSTed),
  // and the selection must differ from the server-persisted value.
  // Reads from `picks` directly (not `submittablePicks`) because a
  // goalscorer edit can exist even on a match with no scoreline changes.
  const dirtyGoalscorerPicks = useMemo(
    () => Object.entries(picks).filter(([mid, p]) =>
      !matchLockedById[mid] &&
      p.goalscorer_dirty &&
      Boolean(p.goalscorer_player_id && p.goalscorer_team_code)
    ),
    [picks, matchLockedById]
  )
  // Union of match IDs with any pending change (scoreline OR goalscorer).
  // Used for the bottom-bar summary count. Dedup so a single match with
  // both a scoreline edit AND a goalscorer edit only counts once.
  const dirtyMatchIds = useMemo(() => {
    const set = new Set<string>()
    for (const [mid] of dirtyPicks) set.add(mid)
    for (const [mid] of dirtyGoalscorerPicks) set.add(mid)
    return set
  }, [dirtyPicks, dirtyGoalscorerPicks])
  const starCount = filledPicks.filter(([, p]) => p.is_star).length

  // Validations
  const capForGroup = 16
  const expected = ROUND_EXPECTED[round_code] ?? 0
  // Pickable count = matches not already locked at page load, OR matches the
  // user already had a pick on (those stay in coverage). Mirrors the server's
  // coverage rule. Fixes the bug where new users on R32 with 2 matches
  // already kicked off could never satisfy the 16-pick requirement.
  const pickableCount = useMemo(() => {
    if (!isKnockout) return expected
    let n = 0
    for (const m of matches) {
      const locked = matchLockedById[m.id]
      const persisted = persistedIds.has(m.id)
      if (!locked || persisted) n++
    }
    return n
  }, [isKnockout, matches, matchLockedById, persistedIds, expected])
  const tooManyGroup = !isKnockout && filledPicks.length > capForGroup
  const tooManyStars = hasStars && starCount > 1
  // Advisory: 'you could pick more'. NOT a save blocker — partial knockout
  // saves are allowed server-side as of 2026-06-29.
  const knockoutShort = isKnockout && filledPicks.length < pickableCount && filledPicks.length > 0
  // Hard block: cannot submit with zero filled picks on knockout (nothing to save)
  const knockoutEmpty = isKnockout && filledPicks.length === 0
  // For draw-winner validation, only consider matches we can actually
  // submit (unlocked). Locked matches are read-only — if they need a draw
  // winner that was never set, that's water under the bridge.
  const drawNeedsWinner = isKnockout && submittablePicks.some(([, p]) =>
    p.home === p.away && !p.if_draw_winner
  )

  // "Round locked" = every match in the round has kicked off. Until then,
  // the user can keep editing unlocked matches.
  const fullyLocked = matches.length > 0 && matches.every((m) => matchLockedById[m.id])
  // Submit is enabled when EITHER a scoreline change OR a goalscorer change
  // is pending. `knockoutEmpty` (no scoreline picks at all on knockout) is
  // still a hard block because the scoreline POST payload can't be empty.
  // If the user has only goalscorer changes on a knockout round but zero
  // scorelines, that's fine — the endpoint accepts an empty picks array
  // via the goalscorer-only path (we skip the winners POST when nothing
  // to save there).
  const hasPending = dirtyPicks.length > 0 || dirtyGoalscorerPicks.length > 0
  const canSubmit = !fullyLocked && hasPending && !tooManyGroup && !tooManyStars && !knockoutEmpty && !drawNeedsWinner

  function setPick(matchId: string, patch: Partial<PickState>) {
    // Scoreline / star / if_draw_winner path. Marks `dirty: true` but does
    // NOT touch `goalscorer_dirty` — those are tracked independently and
    // flushed by the same Submit Round button.
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
        goalscorer_dirty: cur[matchId]?.goalscorer_dirty ?? false,
        ...patch,
        dirty: true,
      },
    }))
  }

  /**
   * Stage a goalscorer selection into local pick state. Does NOT hit the
   * network — the parent's Submit Round button flushes everything at once.
   * Pass `null` team/player to revert to "no pick" (also marked dirty so
   * server persistence catches up on next submit).
   */
  function stageGoalscorer(
    matchId: string,
    g: { team_code: string | null; player_id: string | null; player: GoalscorerPlayer | null }
  ) {
    setPicks((cur) => {
      const base = cur[matchId] ?? {
        home: '',
        away: '',
        is_star: false,
        if_draw_winner: null,
        goalscorer_player_id: null,
        goalscorer_team_code: null,
        goalscorer_player: null,
        dirty: false,
        goalscorer_dirty: false,
      }
      const persisted = persistedGoalscorers[matchId] ?? null
      const goalscorer_dirty =
        (g.player_id ?? null) !== (persisted?.player_id ?? null) ||
        (g.team_code ?? null) !== (persisted?.team_code ?? null)
      return {
        ...cur,
        [matchId]: {
          ...base,
          goalscorer_player_id: g.player_id,
          goalscorer_team_code: g.team_code,
          goalscorer_player: g.player,
          goalscorer_dirty,
        },
      }
    })
  }

  async function clearPick(matchId: string) {
    // Local-only clear if this pick was never saved server-side.
    if (!persistedIds.has(matchId)) {
      setPicks((cur) => {
        const next = { ...cur }
        delete next[matchId]
        return next
      })
      return
    }
    if (clearing.has(matchId)) return
    setClearing((cur) => new Set(cur).add(matchId))
    setMsg(null)
    try {
      const r = await fetch('/api/predictor/picks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ round_code, match_ids: [matchId] }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        if (j?.error === 'match_locked') {
          setMsg({ kind: 'err', text: 'Match already kicked off — picks are locked.' })
        } else {
          setMsg({ kind: 'err', text: j?.error || 'Clear failed.' })
        }
        return
      }
      // Success: drop from local state + persisted set.
      setPicks((cur) => {
        const next = { ...cur }
        delete next[matchId]
        return next
      })
      setPersistedIds((cur) => {
        const next = new Set(cur)
        next.delete(matchId)
        return next
      })
      setMsg({ kind: 'ok', text: 'Pick cleared. You can add a new one now.' })
    } catch {
      setMsg({ kind: 'err', text: 'Network error.' })
    } finally {
      setClearing((cur) => {
        const next = new Set(cur)
        next.delete(matchId)
        return next
      })
    }
  }

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true); setMsg(null)

    // ----- Phase 1: winners / scorelines --------------------------------
    // Skip the winners POST entirely if the user only touched goalscorers
    // AND has zero unlocked filled picks to send. In practice the picks
    // endpoint would just no-op on an empty array, but skipping saves a
    // round trip and avoids a confusing "Saved 0 picks" toast.
    const hasScorelineChanges = dirtyPicks.length > 0
    let winnersSavedCount = 0
    if (hasScorelineChanges) {
      // Only POST submittable (unlocked) picks. Locked matches stay
      // visible read-only but are NEVER sent to the server.
      const payload = {
        round_code,
        picks: submittablePicks.map(([match_id, p]) => ({
          match_id,
          home_score: parseInt(p.home, 10),
          away_score: parseInt(p.away, 10),
          if_draw_winner: p.if_draw_winner,
          is_star: p.is_star,
        })),
      }
      let r: Response
      try {
        r = await fetch('/api/predictor/picks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })
      } catch {
        setMsg({ kind: 'err', text: 'Network error.' })
        setBusy(false)
        return
      }
      const j = await r.json().catch(() => null)
      if (r.status === 401) {
        setMsg({ kind: 'err', text: 'Sign in to save your picks.' })
        setBusy(false); return
      }
      if (r.status === 403) {
        if (j?.error === 'match_locked') {
          const ids = Array.isArray(j.locked)
            ? (j.locked as Array<{ match_id?: string }>).map((x) => x.match_id).filter(Boolean).join(', ')
            : ''
          setMsg({ kind: 'err', text: `Some matches locked at kickoff: ${ids || 'unknown'}. Refresh to see read-only state.` })
        } else if (j?.error === 'star_locked' || j?.error === 'cannot_star_locked_match') {
          setMsg({ kind: 'err', text: 'Your star is on a locked match — it can\'t be moved.' })
        } else {
          setMsg({ kind: 'err', text: 'This round is locked.' })
          setLocked(true)
        }
        setBusy(false); return
      }
      if (!r.ok) {
        if (j?.error === 'pick_cap_exceeded') {
          setMsg({ kind: 'err', text: `Pick cap: ${j.current}/16 already saved. Drop existing picks before adding new ones.` })
        } else {
          setMsg({ kind: 'err', text: j?.error || 'Save failed.' })
        }
        setBusy(false); return
      }
      // Winners OK. Mark scoreline-side dirty flags clean and remember
      // that these matches now have persisted rows (so goalscorer POSTs
      // in Phase 2 won't hit the scoreline_required 409).
      winnersSavedCount = typeof j?.saved_count === 'number' ? j.saved_count : submittablePicks.length
      setPicks((cur) => Object.fromEntries(Object.entries(cur).map(
        ([k, v]) => [k, { ...v, dirty: false }]
      )))
      setPersistedIds((cur) => {
        const next = new Set(cur)
        for (const [mid] of submittablePicks) next.add(mid)
        return next
      })
    }

    // ----- Phase 2: goalscorers (sequential) ----------------------------
    // Serial POSTs — max 4 goalscorer rounds per round (QF/SF/Final) so
    // fanout would be tiny anyway, and Supabase / Vercel free tier can
    // hiccup under parallel bursts. Track partial success so we surface
    // exactly which match failed.
    const goalscorerJobs: Array<[string, PickState]> = dirtyGoalscorerPicks
    let goalscorersSavedCount = 0
    const failedGoalscorers: Array<{ match_id: string; label: string; error: string }> = []
    for (const [matchId, p] of goalscorerJobs) {
      if (!p.goalscorer_player_id || !p.goalscorer_team_code) continue
      let r: Response
      try {
        r = await fetch('/api/predictor/picks/goalscorer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            match_id: matchId,
            team_code: p.goalscorer_team_code,
            player_id: p.goalscorer_player_id,
          }),
        })
      } catch {
        const mt = matches.find((m) => m.id === matchId)
        failedGoalscorers.push({
          match_id: matchId,
          label: mt ? `${mt.home_team_code} vs ${mt.away_team_code}` : matchId,
          error: 'network',
        })
        continue
      }
      const jg = await r.json().catch(() => null)
      if (!r.ok) {
        const mt = matches.find((m) => m.id === matchId)
        const errText = r.status === 409 && jg?.error === 'scoreline_required'
          ? 'submit scoreline first'
          : (jg?.error || `HTTP ${r.status}`)
        failedGoalscorers.push({
          match_id: matchId,
          label: mt ? `${mt.home_team_code} vs ${mt.away_team_code}` : matchId,
          error: errText,
        })
        continue
      }
      goalscorersSavedCount++
      // Clear this goalscorer's dirty flag + snapshot the new persisted value.
      const savedTeam = p.goalscorer_team_code
      const savedPlayerId = p.goalscorer_player_id
      const savedPlayer = p.goalscorer_player
      setPicks((cur) => {
        const row = cur[matchId]
        if (!row) return cur
        return { ...cur, [matchId]: { ...row, goalscorer_dirty: false } }
      })
      setPersistedGoalscorers((cur) => ({
        ...cur,
        [matchId]: { team_code: savedTeam, player_id: savedPlayerId, player: savedPlayer },
      }))
    }

    // ----- Phase 3: final user-facing message ---------------------------
    if (failedGoalscorers.length > 0) {
      const details = failedGoalscorers.map((f) => `${f.label} (${f.error})`).join(', ')
      const winnerBit = hasScorelineChanges
        ? `Saved ${winnersSavedCount} pick${winnersSavedCount === 1 ? '' : 's'}, but `
        : ''
      setMsg({
        kind: 'err',
        text: `${winnerBit}goalscorer save failed for ${details} — retry.`,
      })
    } else {
      const parts: string[] = []
      if (hasScorelineChanges) {
        parts.push(`${winnersSavedCount} pick${winnersSavedCount === 1 ? '' : 's'}`)
      }
      if (goalscorersSavedCount > 0) {
        parts.push(`${goalscorersSavedCount} goalscorer${goalscorersSavedCount === 1 ? '' : 's'}`)
      }
      setMsg({
        kind: 'ok',
        text: parts.length ? `Saved ${parts.join(' + ')}.` : 'Nothing to save.',
      })
    }
    setBusy(false)
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
            ? `Pick every match (${expected} total).`
            : `Pick up to 16 of 24 matches. 1 star allowed.`}
        </p>
        {anyLocked && !fullyLocked && (
          <p style={{ color: C.muted, fontSize: '0.78rem', margin: '0.4rem 0 0', fontStyle: 'italic' }}>
            Locked matches are read-only. You can still edit any unlocked match anytime.
          </p>
        )}
      </div>

      {/* Sticky counters + lock */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        marginBottom: '1rem',
        padding: '0.6rem 0.9rem',
        borderRadius: '0.6rem',
        backgroundColor: fullyLocked ? 'rgba(136,153,204,0.08)' : 'rgba(251,191,36,0.08)',
        border: `1px solid ${fullyLocked ? '#2a3550' : 'rgba(251,191,36,0.3)'}`,
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
        <span style={{ color: fullyLocked ? C.muted : C.gold }}>
          {fullyLocked ? 'Round locked' : `First lock in ${countdown}`}
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
            goalscorer_dirty: false,
          }
          const isDraw = pick.home !== '' && pick.home === pick.away
          const drawNeedsPick = isKnockout && isDraw && !pick.if_draw_winner
          const matchLocked = matchLockedById[mt.id] === true
          const score = scores[mt.id] || null
          return (
            <MatchCard
              key={mt.id}
              match={mt}
              pick={pick}
              score={score}
              isKnockout={isKnockout}
              hasStars={hasStars}
              hasGoalscorer={hasGoalscorer}
              // Lock is purely per-match — `matchLocked` is true only once that
              // specific match has kicked off. We deliberately do NOT mix in the
              // round-level `locked` flag here: doing so would freeze every
              // unkicked match in the round the moment ANY match in it started.
              // (That was the R2 "can't edit picks" regression.)
              locked={matchLocked}
              matchLocked={matchLocked}
              drawNeedsPick={drawNeedsPick}
              clearable={
                !matchLocked &&
                pick.home !== '' &&
                pick.away !== ''
              }
              clearing={clearing.has(mt.id)}
              persistedGoalscorer={persistedGoalscorers[mt.id] ?? null}
              onChange={(patch) => setPick(mt.id, patch)}
              onClear={() => clearPick(mt.id)}
              onStageGoalscorer={(g) => stageGoalscorer(mt.id, g)}
            />
          )
        })}
      </div>

      {/* Sticky submit. Hidden once the WHOLE round is locked. Until then,
          the bar stays visible so the user can save edits to unlocked
          matches even if some matches have already kicked off. */}
      {!fullyLocked && (
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
            {knockoutShort && <span style={{ color: C.muted }}>{filledPicks.length}/{pickableCount} picked — save what you have, add more anytime</span>}
            {knockoutEmpty && <span style={{ color: C.red }}>Pick at least one match to save</span>}
            {drawNeedsWinner && <span style={{ color: C.red }}>Choose draw advancer</span>}
            {canSubmit && <span>Ready to submit {dirtyMatchIds.size} change{dirtyMatchIds.size === 1 ? '' : 's'}</span>}
            {!canSubmit && filledPicks.length === 0 && <span>No picks yet</span>}
            {!canSubmit && filledPicks.length > 0 && dirtyMatchIds.size === 0 && !tooManyGroup && !tooManyStars && !knockoutShort && !drawNeedsWinner && (
              <span>No changes to save</span>
            )}
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
  match, pick, score, isKnockout, hasStars, hasGoalscorer, locked, matchLocked = false, drawNeedsPick,
  clearable = false, clearing = false, persistedGoalscorer = null,
  onChange, onClear, onStageGoalscorer,
}: {
  match: PredictorMatch
  pick: PickState
  score: ScoreBreakdown | null
  isKnockout: boolean
  hasStars: boolean
  hasGoalscorer: boolean
  locked: boolean
  matchLocked?: boolean
  drawNeedsPick: boolean
  clearable?: boolean
  clearing?: boolean
  /** Server-persisted goalscorer snapshot; drives "Cancel" revert. */
  persistedGoalscorer?: PersistedGoalscorer | null
  onChange: (patch: Partial<PickState>) => void
  onClear?: () => void
  /** Stage a goalscorer selection into parent state (dirty; not yet POSTed). */
  onStageGoalscorer: (g: { team_code: string | null; player_id: string | null; player: GoalscorerPlayer | null }) => void
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

  // ----- Post-match result rendering --------------------------------------
  // A match is "finalized" once both scores are present. We render the
  // result row + color band whenever that's true, regardless of whether
  // we have a stored per-pick score (score may be null if the user didn't
  // submit a pick — in that case outcome is gray / No pick).
  const isFinalized = match.home_score !== null && match.away_score !== null
  const hasPick = pick.home !== '' && pick.away !== ''
  // outcome_color: prefer stored (authoritative, from scoring engine).
  // Fall back to 'gray' when no pick / no score row yet.
  const outcome: 'teal' | 'green' | 'red' | 'gray' = isFinalized
    ? (score?.outcome_color ?? (hasPick ? 'red' : 'gray'))
    : 'gray'
  const showResult = isFinalized
  const borderColor = showResult
    ? OUTCOME_BORDER[outcome]
    : (matchLocked ? '#2a3550' : (pick.is_star ? '#FBBF2466' : (drawNeedsPick ? '#F8717166' : C.borderSoft)))
  const bgColor = showResult
    ? OUTCOME_BG[outcome]
    : (matchLocked ? 'rgba(15, 28, 77, 0.55)' : C.card)

  return (
    <div
      title={matchLocked ? 'Locked at kickoff' : undefined}
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderLeft: showResult ? `4px solid ${OUTCOME_BORDER[outcome]}` : `1px solid ${borderColor}`,
        borderRadius: '0.75rem',
        padding: '0.85rem 0.75rem',
        minWidth: 0,
        overflow: 'hidden',
        opacity: matchLocked && !showResult ? 0.55 : 1,
        transition: 'opacity 120ms ease, background-color 200ms ease, border-color 200ms ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.7rem', color: C.muted }}>
        <span>
          Match {match.match_num} · {dateStr} CT
          {matchLocked && !showResult && <span style={{ marginLeft: '0.5rem', color: C.muted, fontWeight: 800 }}>· LOCKED</span>}
          {showResult && <span style={{ marginLeft: '0.5rem', color: OUTCOME_BORDER[outcome], fontWeight: 800 }}>· FINAL</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {clearable && onClear && (
            <button
              onClick={() => !clearing && onClear()}
              disabled={clearing}
              title="Drop this pick (lets you pick a different match)"
              aria-label="Clear pick"
              style={{
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: '0.35rem',
                color: '#F87171',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: clearing ? 'default' : 'pointer',
                padding: '0.15rem 0.45rem',
                opacity: clearing ? 0.6 : 1,
              }}
            >{clearing ? '…' : '✕ Clear'}</button>
          )}
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
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
        <TeamSide team={match.home_team_code} align="right" />
        <ScoreInput value={pick.home} onChange={(v) => !locked && onChange({ home: v })} disabled={locked} />
        <span style={{ color: C.muted, fontSize: '0.85rem', flexShrink: 0 }}>–</span>
        <ScoreInput value={pick.away} onChange={(v) => !locked && onChange({ away: v })} disabled={locked} />
        <TeamSide team={match.away_team_code} align="left" />
      </div>
      {showResult && (
        <ResultRow match={match} score={score} hasPick={hasPick} outcome={outcome} />
      )}
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
          isKnockout={isKnockout}
          persistedGoalscorer={persistedGoalscorer}
          onStage={onStageGoalscorer}
        />
      )}
    </div>
  )
}

function GoalscorerSection({
  match, pick, locked, isKnockout, persistedGoalscorer, onStage,
}: {
  match: PredictorMatch
  pick: PickState
  locked: boolean
  /** When true, the player picker hard-filters to players with logged minutes. */
  isKnockout: boolean
  /** Last server-persisted goalscorer for this match (null if none). */
  persistedGoalscorer: PersistedGoalscorer | null
  /**
   * Stage a goalscorer selection into parent state. Marks the pick dirty;
   * the parent's Submit Round button flushes to the server. Pass
   * `{ team_code: null, player_id: null, player: null }` to clear.
   */
  onStage: (g: { team_code: string | null; player_id: string | null; player: GoalscorerPlayer | null }) => void
}) {
  // "Has any selection" (dirty in-progress OR persisted). The chip view
  // shows when there's a complete selection AND we're not in edit mode.
  const hasSelection = Boolean(pick.goalscorer_player_id && pick.goalscorer_team_code)
  const [editing, setEditing] = useState(false)
  const open = !hasSelection || editing

  const selTeam = pick.goalscorer_team_code ?? ''
  const selPlayer = pick.goalscorer_player_id ?? ''

  const [players, setPlayers] = useState<GoalscorerPlayer[] | null>(null)
  const [loadingPlayers, setLoadingPlayers] = useState(false)

  // Fetch squad whenever team changes.
  useEffect(() => {
    if (!selTeam) { setPlayers(null); return }
    let cancelled = false
    setLoadingPlayers(true)
    ;(async () => {
      try {
        // R16+ (knockout) rounds: only surface players who have logged
        // minutes so far. Group rounds keep the full roster so day-1 pickers
        // aren't empty. `isKnockout` is defined by the parent RoundCard.
        const playedOnly = isKnockout ? '&played_only=1' : ''
        const r = await fetch(`/api/predictor/players?team_code=${encodeURIComponent(selTeam)}${playedOnly}`, { credentials: 'include' })
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
  }, [selTeam, isKnockout])

  // If team changes and the currently-selected player isn't on the new
  // squad, clear the player half of the selection. Done by staging a
  // team-only update.
  useEffect(() => {
    if (!players || !selPlayer) return
    if (!players.some((p) => p.id === selPlayer)) {
      onStage({ team_code: selTeam || null, player_id: null, player: null })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players])

  function pickTeam(nextTeam: string) {
    if (locked) return
    if (nextTeam === selTeam) return
    // Team change wipes the player selection until the new squad loads.
    onStage({ team_code: nextTeam || null, player_id: null, player: null })
  }

  function pickPlayer(nextPlayerId: string) {
    if (locked || !selTeam) return
    if (!nextPlayerId) {
      onStage({ team_code: selTeam, player_id: null, player: null })
      return
    }
    const found = (players ?? []).find((p) => p.id === nextPlayerId) ?? null
    onStage({ team_code: selTeam, player_id: nextPlayerId, player: found })
  }

  function cancelEdit() {
    // Revert to last server-persisted value (or clear if none).
    if (persistedGoalscorer) {
      onStage({
        team_code: persistedGoalscorer.team_code,
        player_id: persistedGoalscorer.player_id,
        player: persistedGoalscorer.player,
      })
    } else {
      onStage({ team_code: null, player_id: null, player: null })
    }
    setEditing(false)
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
      border: `1px solid ${hasSelection && !editing ? '#2a3550' : 'rgba(251,191,36,0.25)'}`,
    }}>
      <div style={{
        color: C.muted,
        fontSize: '0.7rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '0.4rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        flexWrap: 'wrap',
      }}>
        <span>Anytime Goalscorer</span>
        {pick.goalscorer_dirty && (
          <span style={{
            color: C.gold,
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'none',
            letterSpacing: 0,
          }}>· unsaved</span>
        )}
      </div>
      {!open && hasSelection && (
        <button
          type="button"
          onClick={() => !locked && setEditing(true)}
          disabled={locked}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: pick.goalscorer_dirty ? 'rgba(251,191,36,0.10)' : 'rgba(0,230,118,0.10)',
            border: `1px solid ${pick.goalscorer_dirty ? C.gold : C.green}`,
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
              onChange={(e) => pickTeam(e.target.value)}
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
              onChange={(e) => pickPlayer(e.target.value)}
              disabled={locked || !selTeam || loadingPlayers}
              style={{ ...selectStyle, flex: '2 1 200px', minWidth: 160 }}
              aria-label="Select player"
            >
              <option value="">
                {!selTeam ? 'Pick team first' : loadingPlayers ? 'Loading…' : (players && players.length === 0 ? 'No players available' : 'Select player')}
              </option>
              {(players ?? []).map((pl) => {
                const base = pl.short_name || pl.name || pl.last_name || pl.id
                // Display tournament-goals count when >0 so the picker
                // reads like a shortlist (e.g. "K. Mbappé (6)"). Silent
                // when 0 to avoid noisy "(0)" everywhere.
                const label = (pl.goals ?? 0) > 0 ? `${base} (${pl.goals})` : base
                return <option key={pl.id} value={pl.id}>{label}</option>
              })}
            </select>
          </div>
          {editing && (
            <button
              type="button"
              onClick={cancelEdit}
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
          {!locked && hasSelection && !editing && pick.goalscorer_dirty && (
            <div style={{ fontSize: '0.7rem', color: C.muted }}>
              Hit <strong>Submit Round</strong> below to save.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Renders the post-match result block: actual scoreline (with PK winner if
 * applicable), the outcome badge (Exact / Result / Miss / No pick) and the
 * points pill with star ×2 + goalscorer +2 modifiers when present.
 *
 * Color band is driven by the parent card; this block only renders text.
 */
function ResultRow({
  match, score, hasPick, outcome,
}: {
  match: PredictorMatch
  score: ScoreBreakdown | null
  hasPick: boolean
  outcome: 'teal' | 'green' | 'red' | 'gray'
}) {
  const color = OUTCOME_BORDER[outcome]
  const totalPts = score?.total_pts ?? 0
  const star = (score?.star_multiplier ?? 1) === 2
  const scorerHit = (score?.scorer_pts ?? 0) > 0
  const pkLine = match.went_to_pks && match.pk_winner_team_code
    ? ` · PKs: ${match.pk_winner_team_code}`
    : ''
  return (
    <div style={{
      marginTop: '0.6rem',
      padding: '0.5rem 0.7rem',
      borderRadius: '0.4rem',
      backgroundColor: 'rgba(10,15,46,0.55)',
      border: `1px solid ${color}33`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '0.6rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        <div style={{ color: C.text, fontSize: '0.78rem', fontWeight: 700 }}>
          Actual: <span style={{ color: C.text }}>{match.home_team_code} {match.home_score}–{match.away_score} {match.away_team_code}</span>
          <span style={{ color: C.muted, fontWeight: 600 }}>{pkLine}</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span style={{ color, fontWeight: 800 }}>{OUTCOME_LABEL[outcome]}</span>
          {hasPick && score && (
            <span style={{ color: C.muted, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
              {' · '}{score.exact_pts > 0 ? '10 exact' : score.result_pts > 0 ? '4 result' : '0 base'}
              {scorerHit && ' · +2 scorer'}
              {star && ' · ×2 star'}
            </span>
          )}
        </div>
      </div>
      <div style={{
        backgroundColor: outcome === 'gray' ? 'rgba(136,153,204,0.10)' : `${color}22`,
        border: `1px solid ${color}`,
        color,
        borderRadius: '999px',
        padding: '0.3rem 0.7rem',
        fontSize: '0.85rem',
        fontWeight: 900,
        flexShrink: 0,
        minWidth: '3.2rem',
        textAlign: 'center',
      }}>
        {totalPts > 0 ? `+${totalPts}` : totalPts === 0 ? '0' : totalPts}
        <span style={{ fontSize: '0.65rem', fontWeight: 700, marginLeft: '0.2rem', opacity: 0.8 }}>pts</span>
      </div>
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
