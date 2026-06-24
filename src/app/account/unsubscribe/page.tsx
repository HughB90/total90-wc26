/**
 * /account/unsubscribe — public, token-gated unsubscribe page.
 *
 * URL shapes:
 *   ?t=<unsub_token>&type=<email_type>   → flip the matching per-type flag false
 *   ?t=<unsub_token>&all=1               → set unsub_all=true
 *
 * No auth required — the token IS the auth. We look up the prefs row by
 * unsub_token via service-role admin client.
 *
 * If the token is unknown / invalid, render a friendly "this link has
 * expired" page (don't leak which tokens exist).
 *
 * Re-subscribe is handled client-side via POST /api/account/email-prefs/resub
 * (token-based, no auth).
 */

import { createAdminSupabase } from '@/lib/supabase-server'
import { prefColumnForType, type EmailPrefs } from '@/lib/email/prefs'
import ResubButton from './ResubButton'

export const dynamic = 'force-dynamic'

type SearchParams = { t?: string; type?: string; all?: string }

const TYPE_LABELS: Record<string, string> = {
  round_reminders: 'round reminders',
  league_invites: 'league invites',
  winner_lock: 'winner-lock notifications',
  marketing: 'product news & announcements',
}

function describeType(type?: string, all?: boolean): string {
  if (all) return 'all Total90 emails'
  if (!type) return 'these emails'
  const col = prefColumnForType(type)
  if (col && TYPE_LABELS[col]) return TYPE_LABELS[col]
  return 'these emails'
}

async function applyUnsub(
  token: string,
  type: string | undefined,
  all: boolean
): Promise<{ ok: boolean; prefs: EmailPrefs | null; column: string | null }> {
  const admin = createAdminSupabase()

  const { data: prefs } = await admin
    .from('email_prefs')
    .select('*')
    .eq('unsub_token', token)
    .maybeSingle()

  if (!prefs) return { ok: false, prefs: null, column: null }

  if (all) {
    const { error } = await admin
      .from('email_prefs')
      .update({ unsub_all: true, updated_at: new Date().toISOString() })
      .eq('unsub_token', token)
    if (error) return { ok: false, prefs: prefs as EmailPrefs, column: null }
    return { ok: true, prefs: prefs as EmailPrefs, column: 'unsub_all' }
  }

  const col = type ? prefColumnForType(type) : null
  if (!col) {
    // Unknown type — fall back to marketing flag (safest default for our brand).
    const { error } = await admin
      .from('email_prefs')
      .update({ marketing: false, updated_at: new Date().toISOString() })
      .eq('unsub_token', token)
    if (error) return { ok: false, prefs: prefs as EmailPrefs, column: null }
    return { ok: true, prefs: prefs as EmailPrefs, column: 'marketing' }
  }

  const { error } = await admin
    .from('email_prefs')
    .update({ [col]: false, updated_at: new Date().toISOString() })
    .eq('unsub_token', token)
  if (error) return { ok: false, prefs: prefs as EmailPrefs, column: null }
  return { ok: true, prefs: prefs as EmailPrefs, column: col }
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const token = sp.t?.trim()
  const type = sp.type?.trim()
  const all = sp.all === '1' || sp.all === 'true'

  if (!token) {
    return <InvalidLink reason="Missing token." />
  }

  const result = await applyUnsub(token, type, all)
  if (!result.ok || !result.prefs) {
    return <InvalidLink reason="This link has expired or is invalid." />
  }

  const label = describeType(type, all)

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A0F2E',
        color: '#F0F4FF',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: '#0F1C4D',
          border: '1px solid #1E3A6E',
          borderRadius: '1rem',
          padding: '2.5rem 2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
        <h1 style={{ color: '#FBBF24', fontSize: '1.4rem', margin: '0 0 0.75rem' }}>
          You&apos;ve been unsubscribed
        </h1>
        <p style={{ color: '#8899CC', margin: '0 0 1.5rem', fontSize: '0.95rem', lineHeight: 1.55 }}>
          You won&apos;t receive {label} anymore.
          {all ? '' : ' Other Total90 emails are unaffected.'}
        </p>

        <ResubButton token={token} type={type} all={all} />

        <p style={{ color: '#4A6080', fontSize: '0.8rem', margin: '1.75rem 0 0' }}>
          Manage all your email preferences any time at{' '}
          <a
            href="https://wc26.total90.com/account/email"
            style={{ color: '#FBBF24', textDecoration: 'underline' }}
          >
            account settings
          </a>
          .
        </p>
        <p style={{ color: '#4A6080', fontSize: '0.75rem', margin: '1rem 0 0' }}>
          Total90 · wc26.total90.com
        </p>
      </div>
    </main>
  )
}

function InvalidLink({ reason }: { reason: string }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A0F2E',
        color: '#F0F4FF',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: '#0F1C4D',
          border: '1px solid #1E3A6E',
          borderRadius: '1rem',
          padding: '2.5rem 2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔗</div>
        <h1 style={{ color: '#FBBF24', fontSize: '1.25rem', margin: '0 0 0.5rem' }}>
          Hmm, that link didn&apos;t work
        </h1>
        <p style={{ color: '#8899CC', margin: '0 0 1.5rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
          {reason} If you want to unsubscribe, reply to any Total90 email and we&apos;ll handle it
          for you.
        </p>
        <a
          href="https://wc26.total90.com"
          style={{
            display: 'inline-block',
            background: '#FBBF24',
            color: '#0A0F2E',
            fontWeight: 800,
            padding: '0.75rem 1.25rem',
            borderRadius: '0.75rem',
            textDecoration: 'none',
            fontSize: '0.95rem',
          }}
        >
          Back to wc26.total90.com →
        </a>
      </div>
    </main>
  )
}
