'use client'

/**
 * /auth/reset-password — completes a Supabase Auth password recovery.
 *
 * Two ways a user can land here with a valid recovery session:
 *
 *  1. PKCE flow (current default): /auth/callback exchanged a `?code=`
 *     server-side and the `sb-*` cookies are already live. `getSession()`
 *     returns the session immediately.
 *
 *  2. Legacy hash-fragment flow: the URL still contains
 *     `#access_token=...&type=recovery`; the browser Supabase client
 *     picks that up and fires `PASSWORD_RECOVERY`.
 *
 * Either way we then call `updateUser({ password })` and redirect to
 * /bracket.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    // Supabase's legacy recovery flow lands us here with the session encoded
    // in the URL hash fragment:
    //   #access_token=...&refresh_token=...&expires_in=...&token_type=bearer&type=recovery
    //
    // @supabase/ssr's createBrowserClient uses cookie storage and does NOT
    // auto-parse window.location.hash the way the vanilla supabase-js client
    // does. So we have to do it ourselves: pull the tokens out and call
    // setSession() explicitly, which writes the sb-* cookies and fires
    // SIGNED_IN. Then we wipe the hash so a refresh doesn't try to re-process
    // an already-used token.
    let cancelled = false

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasSession(true)
        setReady(true)
      }
    })

    async function bootstrap() {
      // 1. Already have a session (page revisited after success, or cookies live)?
      const existing = await supabase.auth.getSession()
      if (cancelled) return
      if (existing.data.session) {
        setHasSession(true)
        setReady(true)
        return
      }

      // 2. Try to recover from the URL hash fragment.
      if (typeof window !== 'undefined' && window.location.hash.length > 1) {
        const params = new URLSearchParams(window.location.hash.slice(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        const type = params.get('type')
        const hashErr = params.get('error_description') || params.get('error')

        if (hashErr) {
          setReady(true)
          return
        }
        if (access_token && refresh_token && type === 'recovery') {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (cancelled) return
          if (!setErr) {
            setHasSession(true)
            // Strip the hash so a reload doesn't replay a now-used token.
            try {
              window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search
              )
            } catch {
              /* non-fatal */
            }
          }
          setReady(true)
          return
        }
      }

      // 3. No session, no recoverable hash — link is invalid/expired.
      setReady(true)
    }
    void bootstrap()

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords don’t match.')
      return
    }
    setLoading(true)
    const { error: upErr } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    // Redirect into the app. The Supabase session cookies are already live.
    router.replace('/bracket')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-cyan-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-2">Set a New Password</h1>
        <p className="text-emerald-200 mb-6">
          Choose a new password for your World Cup account.
        </p>

        {!ready ? (
          <p className="text-emerald-200 text-sm">Verifying recovery link…</p>
        ) : !hasSession ? (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
            This reset link is invalid or has expired. Request a new one from
            the <a href="/auth/signin" className="underline">sign-in page</a>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-emerald-100 mb-1">
                New password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-emerald-100 mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
