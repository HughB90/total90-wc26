'use client'

/**
 * /admin/predictor/score-match — manual match-result entry + scoring trigger.
 *
 * INTERNAL ADMIN TOOL (Hugh only). Used to test the WC26 predictor scoring
 * pipeline end-to-end before kickoff (June 11). Set a score, save, run
 * scoring. Reset and re-test.
 *
 * Auth: PREDICTOR_ADMIN_KEY pasted once per session into a password field,
 * held in React state only (never localStorage), sent as `x-admin-key`
 * header on every API call.
 *
 * Endpoints used:
 *   - GET   /api/admin/predictor/matches            list all matches
 *   - PATCH /api/admin/predictor/matches/[id]       save edits
 *   - POST  /api/predictor/score-match              run the scoring pipeline
 *
 * UX rule (per spec): "survivable for late-night tired use." Big buttons,
 * plain-English errors, obvious labels. NOT a developer terminal.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

const C = {
  bg: '#0A0F2E',
  card: '#0F1C4D',
  gold: '#FBBF24',
  green: '#00E676',
  red: '#FF5252',
  muted: '#8899CC',
  text: '#F0F4FF',
  border: 'rgba(255,255,255,0.08)',
}

interface MatchRow {
  id: string
  round_code: string
  home_team_code: string
  away_team_code: string
  kickoff_at: string
  home_score: number | null
  away_score: number | null
  went_to_pks: boolean
  pk_winner_team_code: string | null
  goalscorers: unknown
  status: string
  is_knockout: boolean | null
}

interface Goalscorer {
  player_id: string
  team_code: string
  minute: string // form input — coerced to int on save
}

const STATUS_OPTIONS = ['scheduled', 'live', 'final']

function isKnockout(m: MatchRow): boolean {
  if (m.is_knockout) return true
  const r = (m.round_code ?? '').toLowerCase()
  return r === 'final' || /^r\d/.test(r) || r === 'qf' || r === 'sf'
}

function formatKickoff(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function parseGoalscorers(raw: unknown): Goalscorer[] {
  if (!Array.isArray(raw)) return []
  const out: Goalscorer[] = []
  for (const entry of raw) {
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>
      const player_id = typeof obj.player_id === 'string' ? obj.player_id
        : typeof obj.id === 'string' ? obj.id
        : ''
      const team_code = typeof obj.team_code === 'string' ? obj.team_code : ''
      const minuteRaw = obj.minute
      const minute = typeof minuteRaw === 'number' ? String(minuteRaw)
        : typeof minuteRaw === 'string' ? minuteRaw
        : ''
      out.push({ player_id, team_code, minute })
    } else if (typeof entry === 'string') {
      out.push({ player_id: entry, team_code: '', minute: '' })
    }
  }
  return out
}

export default function ScoreMatchAdminPage() {
  const [adminKey, setAdminKey] = useState('')
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Editable form state for the selected match
  const [homeScore, setHomeScore] = useState<string>('')
  const [awayScore, setAwayScore] = useState<string>('')
  const [wentToPks, setWentToPks] = useState(false)
  const [pkWinner, setPkWinner] = useState<string>('')
  const [statusVal, setStatusVal] = useState<string>('final')
  const [scorers, setScorers] = useState<Goalscorer[]>([])

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [busy, setBusy] = useState<null | 'save' | 'score' | 'reset'>(null)
  const [scoreResult, setScoreResult] = useState<unknown>(null)

  const selected = useMemo(
    () => matches.find((m) => m.id === selectedId) ?? null,
    [matches, selectedId],
  )

  // ------- helpers -------
  const showToast = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    if (kind === 'ok') {
      window.setTimeout(() => setToast(null), 4000)
    }
  }, [])

  const explainError = (status: number, body: unknown): string => {
    const errText = (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>))
      ? String((body as Record<string, unknown>).error)
      : ''
    if (status === 401) return 'Admin key rejected. Double-check PREDICTOR_ADMIN_KEY and paste it again.'
    if (status === 503) return 'Server says PREDICTOR_ADMIN_KEY is not configured. Check Vercel env vars.'
    if (status === 404) return 'Match not found — did the row get deleted?'
    if (status === 422) return `Server refused: ${errText || 'invalid input.'}`
    if (status === 400) return `Bad request: ${errText || 'check the form fields.'}`
    if (status >= 500) return `Server error (${status})${errText ? ': ' + errText : ''}. Check the logs.`
    return errText ? `Error ${status}: ${errText}` : `Error ${status}.`
  }

  const friendlyNetworkError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e)
    return `Couldn't reach the server (${msg}). Check your connection and try again.`
  }

  // ------- load matches -------
  const loadMatches = useCallback(async () => {
    if (!adminKey) {
      setLoadError('Paste your admin key above to load matches.')
      return
    }
    setLoadingMatches(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/predictor/matches', {
        headers: { 'x-admin-key': adminKey },
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(explainError(res.status, body))
        setMatches([])
        return
      }
      const list = Array.isArray(body.matches) ? (body.matches as MatchRow[]) : []
      setMatches(list)
      // Default selection: first match with home_score null, else first match.
      const firstUnscored = list.find((m) => m.home_score === null)
      const defaultPick = firstUnscored?.id ?? list[0]?.id ?? ''
      setSelectedId((prev) => prev || defaultPick)
    } catch (e) {
      setLoadError(friendlyNetworkError(e))
      setMatches([])
    } finally {
      setLoadingMatches(false)
    }
  }, [adminKey])

  // When the selected match changes, hydrate the form fields.
  useEffect(() => {
    if (!selected) return
    setHomeScore(selected.home_score == null ? '' : String(selected.home_score))
    setAwayScore(selected.away_score == null ? '' : String(selected.away_score))
    setWentToPks(!!selected.went_to_pks)
    setPkWinner(selected.pk_winner_team_code ?? '')
    setStatusVal(selected.status || 'final')
    setScorers(parseGoalscorers(selected.goalscorers))
    setScoreResult(null)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------- save -------
  const onSave = async () => {
    if (!selected) return
    if (!adminKey) {
      showToast('err', 'Paste your admin key first.')
      return
    }
    const home = homeScore === '' ? null : Number(homeScore)
    const away = awayScore === '' ? null : Number(awayScore)
    if (home !== null && (!Number.isInteger(home) || home < 0)) {
      showToast('err', 'Home score must be a non-negative whole number (or blank).')
      return
    }
    if (away !== null && (!Number.isInteger(away) || away < 0)) {
      showToast('err', 'Away score must be a non-negative whole number (or blank).')
      return
    }

    // Build goalscorers jsonb. Skip rows with no player_id.
    const goalscorersPayload = scorers
      .filter((s) => s.player_id.trim() !== '')
      .map((s) => {
        const out: Record<string, unknown> = {
          player_id: s.player_id.trim(),
          team_code: s.team_code.trim() || null,
        }
        if (s.minute !== '' && Number.isFinite(Number(s.minute))) {
          out.minute = Number(s.minute)
        }
        return out
      })

    const payload: Record<string, unknown> = {
      home_score: home,
      away_score: away,
      status: statusVal,
      goalscorers: goalscorersPayload,
    }
    if (isKnockout(selected)) {
      payload.went_to_pks = wentToPks
      payload.pk_winner_team_code = pkWinner.trim() === '' ? null : pkWinner.trim()
    }

    setBusy('save')
    setToast(null)
    try {
      const res = await fetch(`/api/admin/predictor/matches/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('err', explainError(res.status, body))
        return
      }
      // Re-apply returned row to local list (keeps things in sync).
      const updated = body.match as MatchRow | undefined
      if (updated) {
        setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      }
      showToast('ok', `Saved ${selected.id}. Status: ${statusVal}.`)
    } catch (e) {
      showToast('err', friendlyNetworkError(e))
    } finally {
      setBusy(null)
    }
  }

  // ------- run scoring -------
  const onRunScoring = async () => {
    if (!selected) return
    if (!adminKey) {
      showToast('err', 'Paste your admin key first.')
      return
    }
    setBusy('score')
    setScoreResult(null)
    setToast(null)
    try {
      const res = await fetch('/api/predictor/score-match', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
        body: JSON.stringify({ match_id: selected.id }),
      })
      const body = await res.json().catch(() => ({}))
      setScoreResult(body)
      if (!res.ok) {
        showToast('err', explainError(res.status, body))
        return
      }
      const scored = typeof body.scored_profiles === 'number' ? body.scored_profiles : '?'
      const cache = typeof body.cache_refreshed === 'number' ? body.cache_refreshed : '?'
      showToast('ok', `Scoring complete. ${scored} pick(s) scored, ${cache} leaderboard row(s) refreshed.`)
    } catch (e) {
      showToast('err', friendlyNetworkError(e))
    } finally {
      setBusy(null)
    }
  }

  // ------- reset -------
  const onReset = async () => {
    if (!selected) return
    if (!adminKey) {
      showToast('err', 'Paste your admin key first.')
      return
    }
    if (!window.confirm(`Reset scores on ${selected.id}? This clears home/away scores, PK info, goalscorers, and sets status back to "scheduled".`)) {
      return
    }
    setBusy('reset')
    setToast(null)
    try {
      const res = await fetch(`/api/admin/predictor/matches/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          home_score: null,
          away_score: null,
          went_to_pks: false,
          pk_winner_team_code: null,
          goalscorers: [],
          status: 'scheduled',
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('err', explainError(res.status, body))
        return
      }
      const updated = body.match as MatchRow | undefined
      if (updated) {
        setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      }
      // Clear local form too.
      setHomeScore('')
      setAwayScore('')
      setWentToPks(false)
      setPkWinner('')
      setStatusVal('scheduled')
      setScorers([])
      setScoreResult(null)
      showToast('ok', `Reset ${selected.id}. Ready to re-test.`)
    } catch (e) {
      showToast('err', friendlyNetworkError(e))
    } finally {
      setBusy(null)
    }
  }

  // ------- goalscorer row helpers -------
  const addScorer = () => {
    if (!selected) return
    setScorers((prev) => [...prev, { player_id: '', team_code: selected.home_team_code, minute: '' }])
  }
  const removeScorer = (i: number) => {
    setScorers((prev) => prev.filter((_, idx) => idx !== i))
  }
  const updateScorer = (i: number, patch: Partial<Goalscorer>) => {
    setScorers((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  // ------- styles -------
  const card: React.CSSProperties = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '1.25rem',
    marginBottom: '1.25rem',
  }
  const label: React.CSSProperties = {
    display: 'block',
    color: C.muted,
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '0.35rem',
    fontWeight: 700,
  }
  const inputStyle: React.CSSProperties = {
    background: '#070C24',
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: '0.65rem 0.8rem',
    fontSize: '1rem',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }
  const primaryBtn = (disabled: boolean): React.CSSProperties => ({
    background: disabled ? '#666' : C.gold,
    color: '#0A0F2E',
    border: 'none',
    borderRadius: 10,
    padding: '0.95rem 1.4rem',
    fontSize: '1.05rem',
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: '100%',
    letterSpacing: '0.02em',
  })
  const greenBtn = (disabled: boolean): React.CSSProperties => ({
    ...primaryBtn(disabled),
    background: disabled ? '#666' : C.green,
    color: '#0A0F2E',
  })
  const dangerBtn = (disabled: boolean): React.CSSProperties => ({
    background: 'transparent',
    color: disabled ? C.muted : C.red,
    border: `1.5px solid ${disabled ? C.muted : C.red}`,
    borderRadius: 10,
    padding: '0.85rem 1.4rem',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: '100%',
  })

  const teamOptions = selected ? [selected.home_team_code, selected.away_team_code] : []

  return (
    <main style={{
      minHeight: '100vh',
      background: C.bg,
      color: C.text,
      padding: '1.5rem 1rem 4rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{
          color: C.gold,
          fontSize: 'clamp(1.5rem, 4vw, 1.9rem)',
          fontWeight: 900,
          margin: '0 0 0.4rem',
          letterSpacing: '-0.02em',
        }}>Predictor — Score a Match</h1>
        <p style={{ color: C.muted, fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
          Internal admin tool. Set a result, save it, then run the scoring pipeline.
          Use the Reset button to wipe scores and re-test.
        </p>

        {/* Admin key */}
        <div style={card}>
          <label style={label}>Admin key</label>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="PREDICTOR_ADMIN_KEY"
            style={inputStyle}
            autoComplete="off"
          />
          <p style={{ color: C.muted, fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Paste your PREDICTOR_ADMIN_KEY. Held in memory only, not saved.
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              onClick={loadMatches}
              disabled={loadingMatches || !adminKey}
              style={primaryBtn(loadingMatches || !adminKey)}
            >
              {loadingMatches ? 'Loading matches…' : matches.length ? 'Reload matches' : 'Load matches'}
            </button>
          </div>
          {loadError && (
            <p style={{ color: C.red, fontSize: '0.9rem', marginTop: '0.75rem' }}>{loadError}</p>
          )}
        </div>

        {/* Match picker */}
        {matches.length > 0 && (
          <div style={card}>
            <label style={label}>Match ({matches.length} total)</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={inputStyle}
            >
              {matches.map((m) => {
                const tag = m.home_score != null ? '✓ ' : '· '
                return (
                  <option key={m.id} value={m.id}>
                    {tag}
                    {m.round_code}: {m.home_team_code} vs {m.away_team_code} @ {formatKickoff(m.kickoff_at)}
                    {m.home_score != null ? ` (${m.home_score}-${m.away_score})` : ''}
                  </option>
                )
              })}
            </select>
            <p style={{ color: C.muted, fontSize: '0.75rem', marginTop: '0.5rem' }}>
              "✓" = already has a score on file. "·" = unscored.
            </p>
          </div>
        )}

        {/* Match details */}
        {selected && (
          <>
            <div style={card}>
              <h2 style={{ color: C.gold, fontSize: '1.1rem', margin: '0 0 1rem' }}>
                {selected.home_team_code} vs {selected.away_team_code}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem 1rem',
                color: C.muted,
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
              }}>
                <div><span style={{ color: C.muted }}>ID: </span><span style={{ color: C.text }}>{selected.id}</span></div>
                <div><span style={{ color: C.muted }}>Round: </span><span style={{ color: C.text }}>{selected.round_code}</span></div>
                <div><span style={{ color: C.muted }}>Kickoff: </span><span style={{ color: C.text }}>{formatKickoff(selected.kickoff_at)}</span></div>
                <div><span style={{ color: C.muted }}>Knockout: </span><span style={{ color: C.text }}>{isKnockout(selected) ? 'yes' : 'no'}</span></div>
              </div>

              {/* Scores */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={label}>{selected.home_team_code} score</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={homeScore}
                    onChange={(e) => setHomeScore(e.target.value)}
                    style={inputStyle}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label style={label}>{selected.away_team_code} score</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={awayScore}
                    onChange={(e) => setAwayScore(e.target.value)}
                    style={inputStyle}
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Status */}
              <div style={{ marginTop: '1rem' }}>
                <label style={label}>Status</label>
                <select value={statusVal} onChange={(e) => setStatusVal(e.target.value)} style={inputStyle}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Knockout: PK fields */}
              {isKnockout(selected) && (
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
                  <label style={label}>Knockout (PK fields)</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', color: C.text, fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                    <input
                      type="checkbox"
                      checked={wentToPks}
                      onChange={(e) => setWentToPks(e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    Went to PKs
                  </label>
                  {wentToPks && (
                    <div>
                      <label style={label}>PK winner</label>
                      <select value={pkWinner} onChange={(e) => setPkWinner(e.target.value)} style={inputStyle}>
                        <option value="">— select —</option>
                        {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Goalscorers */}
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
                <label style={label}>Goalscorers</label>
                {scorers.length === 0 && (
                  <p style={{ color: C.muted, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                    No goalscorers added. Click below to add one.
                  </p>
                )}
                {scorers.map((s, i) => (
                  <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 0.6fr auto',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                    alignItems: 'center',
                  }}>
                    <input
                      type="text"
                      value={s.player_id}
                      onChange={(e) => updateScorer(i, { player_id: e.target.value })}
                      placeholder="player_id (uuid)"
                      style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.6rem' }}
                    />
                    <select
                      value={s.team_code}
                      onChange={(e) => updateScorer(i, { team_code: e.target.value })}
                      style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.6rem' }}
                    >
                      {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="number"
                      value={s.minute}
                      onChange={(e) => updateScorer(i, { minute: e.target.value })}
                      placeholder="min"
                      style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.5rem 0.6rem' }}
                    />
                    <button
                      onClick={() => removeScorer(i)}
                      style={{
                        background: 'transparent',
                        color: C.red,
                        border: `1px solid ${C.red}`,
                        borderRadius: 6,
                        padding: '0.4rem 0.7rem',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={addScorer}
                  style={{
                    background: 'transparent',
                    color: C.gold,
                    border: `1px dashed ${C.gold}`,
                    borderRadius: 8,
                    padding: '0.6rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    marginTop: '0.25rem',
                  }}
                >
                  + Add goalscorer
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div style={card}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button onClick={onSave} disabled={busy !== null} style={primaryBtn(busy !== null)}>
                  {busy === 'save' ? 'Saving…' : '1. Save Match Result'}
                </button>
                <button onClick={onRunScoring} disabled={busy !== null} style={greenBtn(busy !== null)}>
                  {busy === 'score' ? 'Running scoring…' : '2. Run Scoring'}
                </button>
                <button onClick={onReset} disabled={busy !== null} style={dangerBtn(busy !== null)}>
                  {busy === 'reset' ? 'Resetting…' : 'Reset match (clear scores)'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.kind === 'ok' ? C.green : C.red,
            color: '#0A0F2E',
            padding: '0.85rem 1.25rem',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: '0.95rem',
            maxWidth: '90vw',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            zIndex: 100,
            cursor: 'pointer',
          }} onClick={() => setToast(null)}>
            {toast.msg}
          </div>
        )}

        {/* Scoring result panel */}
        {scoreResult != null && (
          <div style={card}>
            <label style={label}>Scoring result</label>
            <pre style={{
              background: '#070C24',
              color: C.text,
              padding: '0.9rem',
              borderRadius: 8,
              fontSize: '0.78rem',
              overflowX: 'auto',
              margin: 0,
              border: `1px solid ${C.border}`,
              lineHeight: 1.5,
            }}>
{JSON.stringify(scoreResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  )
}
