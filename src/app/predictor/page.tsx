'use client'

/**
 * /predictor — Wave C2 home, 4-tab dashboard.
 *
 * Tabs (mirrors `/predictor/leagues/[id]` visual style):
 *   - Leaderboard (default) — Hero countdown chips, My Team pill, paginated global leaderboard
 *   - Picks                  — Tournament Winner pill + 8 round pills (read-only, Edit -> round page)
 *   - Leagues                — Create/Join buttons + My Leagues pill
 *   - Scoring                — Rules content (shared <ScoringRulesContent />)
 *
 * Tab state lives in `?tab=` query param. Default = `leaderboard`.
 * Hero chips appear ONLY on the Leaderboard tab.
 *
 * Scoring engine (Wave D) is NOT shipped — scores render as 0.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AuthHeader from '@/components/AuthHeader'
import PredictorTabBar, {
  parseTab,
  type PredictorTabId,
} from '@/components/predictor/PredictorTabBar'
import MyTeamCard from '@/components/predictor/MyTeamCard'
import GlobalLeaderboardPill from '@/components/predictor/GlobalLeaderboardPill'
import PicksTabContent from '@/components/predictor/PicksTabContent'
import LeaguesTabContent from '@/components/predictor/LeaguesTabContent'
import ScoringRulesContent from '@/components/predictor/ScoringRulesContent'
import HowToContent from '@/components/predictor/HowToContent'

const C = {
  bg: '#0A0F2E',
  gold: '#FBBF24',
  green: '#00E676',
  muted: '#8899CC',
  text: '#F0F4FF',
}

// R1 first kickoff = winner-pick lock. Mirror lib/predictor-session.ts.
const ROUND_1_LOCK_ISO = '2026-06-11T19:00:00.000Z'

interface MeProfile {
  id: string
  manager_name: string
  display_name: string | null
  first_name: string
}

export default function PredictorPage() {
  return (
    <Suspense fallback={<PageShell><LoadingState /></PageShell>}>
      <PredictorHome />
    </Suspense>
  )
}

function PredictorHome() {
  const searchParams = useSearchParams()
  // Tab is local state, seeded once from ?tab=, then synced back to the URL
  // via window.history.replaceState. We avoid router.replace here because
  // Next 16's App Router silently drops same-pathname search-param-only
  // navigations when the user landed on the page directly (URL stays put,
  // the page feels frozen, no errors). Pure DOM history is reliable.
  const [activeTab, setActiveTab] = useState<PredictorTabId>(() => parseTab(searchParams.get('tab')))

  const [now, setNow] = useState(() => new Date())
  const [me, setMe] = useState<MeProfile | null>(null)
  const [authedReady, setAuthedReady] = useState(false)

  // Tick the countdown
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auth probe — re-runs whenever the active tab changes (so flipping into a
  // tab after sign-in always re-checks the cookie) and whenever the window
  // regains focus (so a sign-in performed in another tab is reflected here).
  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
        if (!r.ok) { if (!cancelled) setAuthedReady(true); return }
        const j = await r.json()
        if (cancelled) return
        if (j?.profile) {
          setMe({
            id: j.profile.id,
            manager_name: j.profile.manager_name ?? j.profile.first_name ?? 'Manager',
            display_name: j.profile.display_name ?? null,
            first_name: j.profile.first_name ?? '',
          })
        } else {
          setMe(null)
        }
      } catch { /* anon */ } finally {
        if (!cancelled) setAuthedReady(true)
      }
    }
    probe()
    const onFocus = () => { probe() }
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    }
  }, [activeTab])

  const handleTabChange = useCallback((tab: PredictorTabId) => {
    setActiveTab(tab)
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (tab === 'leaderboard') {
      sp.delete('tab')
    } else {
      sp.set('tab', tab)
    }
    const qs = sp.toString()
    const next = qs ? `/predictor?${qs}` : '/predictor'
    window.history.replaceState(window.history.state, '', next)
  }, [])

  const lockMs = useMemo(() => new Date(ROUND_1_LOCK_ISO).getTime(), [])
  const r1Locked = now.getTime() >= lockMs
  const countdown = formatCountdown(lockMs - now.getTime())

  return (
    <PageShell>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{
          fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
          fontWeight: 900,
          color: C.gold,
          margin: '0 0 0.35rem',
          letterSpacing: '-0.02em',
        }}>Score Predictor</h1>
        <p style={{ color: C.muted, fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
          Predict every match. Star your bangers. Climb the leaderboard.
        </p>
      </div>

      {/* Hero countdown chips — Leaderboard tab only */}
      {activeTab === 'leaderboard' && (
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          {r1Locked ? (
            <div style={chipStyle('locked')}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.muted }} />
              <span>Round 1 locked — winner pick locked</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch', maxWidth: '100%' }}>
              <div style={chipStyle('primary')}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.gold, flexShrink: 0 }} />
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>Round 1 locks in {countdown}</span>
              </div>
              <div style={chipStyle('secondary')}>
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>Tournament winner locks at the same time</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <PredictorTabBar active={activeTab} onChange={handleTabChange} />

      {/* Tab content */}
      {activeTab === 'leaderboard' && (
        <LeaderboardTab
          authed={Boolean(me)}
          authedReady={authedReady}
          me={me}
        />
      )}
      {activeTab === 'picks' && (
        <PicksTabContent authed={Boolean(me)} />
      )}
      {activeTab === 'leagues' && (
        <LeaguesTabContent authed={Boolean(me)} />
      )}
      {activeTab === 'scoring' && (
        <ScoringRulesContent />
      )}
      {activeTab === 'howto' && (
        <HowToContent />
      )}

      {/* Anon nudge (only on tabs that actually require auth — not Scoring/How To) */}
      {authedReady && !me && activeTab !== 'scoring' && activeTab !== 'howto' && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem 1.25rem',
          backgroundColor: 'rgba(0,230,118,0.06)',
          border: '1px solid rgba(0,230,118,0.2)',
          borderRadius: '0.75rem',
          textAlign: 'center',
          minWidth: 0,
        }}>
          <p style={{ color: C.text, margin: '0 0 0.5rem', fontSize: '0.88rem', lineHeight: 1.5 }}>
            You&apos;re browsing as a guest. Picks save once you sign in.
          </p>
          <span style={{ color: C.green, fontWeight: 700, fontSize: '0.78rem' }}>
            Use the Sign In button up top to play.
          </span>
        </div>
      )}
    </PageShell>
  )
}

function LeaderboardTab({ authed, authedReady, me }: { authed: boolean; authedReady: boolean; me: MeProfile | null }) {
  const [winnerScore] = useState(0) // Wave D will hydrate from /api/predictor/scores
  const [perRound] = useState<Record<string, number>>({}) // Wave D
  const [total] = useState(0)

  return (
    <div style={{ display: 'grid', gap: '0.85rem', minWidth: 0 }}>
      <MyTeamCard
        authed={authed}
        managerName={me?.manager_name ?? null}
        firstName={me?.first_name ?? null}
        total={total}
        perRound={perRound}
        winnerScore={winnerScore}
      />
      {/* Render the global leaderboard for everyone (incl. anon) once auth probe finishes,
          so we don't double-fetch and so anon visitors still see the rankings. */}
      {authedReady && (
        <GlobalLeaderboardPill meId={me?.id ?? null} />
      )}
    </div>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthHeader />
      <main style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '1.5rem 1rem 5rem',
        minWidth: 0,
      }}>
        {children}
      </main>
    </>
  )
}

function LoadingState() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 0', color: C.muted, fontSize: '0.9rem' }}>
      Loading Predictor…
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

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
    maxWidth: '100%',
    minWidth: 0,
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
