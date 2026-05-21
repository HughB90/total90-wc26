'use client'

/**
 * /auth/signin — Supabase Auth email + password sign-in (post 2026-05-20 unification).
 *
 * On success:
 *  - If the user has 1 profile, the server picks it for us. Redirect to ?next or /.
 *  - If multiple profiles, redirect to /auth/picker.
 */

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  )
}

function SignInInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      if (mode === 'reset') {
        await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        })
        setInfo('If that email is registered, a reset link is on its way.')
        return
      }

      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Sign in failed')
        return
      }

      // Server auto-picks when there's exactly one profile.
      if (data.profile) {
        router.push(next)
        router.refresh()
        return
      }
      const profiles = data.profiles ?? []
      if (profiles.length > 1) {
        router.push(`/auth/picker?next=${encodeURIComponent(next)}`)
        return
      }
      setError('No profiles found on this account. Contact support.')
    } catch (err) {
      setError('Network error. Please try again.')
      console.error('Sign in error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-cyan-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-2">
          {mode === 'reset' ? 'Reset Password' : 'Sign In'}
        </h1>
        <p className="text-emerald-200 mb-6">
          {mode === 'reset'
            ? 'Enter your email and we’ll send a reset link.'
            : 'Sign in with your email and password.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-emerald-100 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="you@example.com"
            />
          </div>

          {mode === 'signin' && (
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-emerald-100 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="••••••••"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-3 text-emerald-200 text-sm">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading
              ? 'Loading…'
              : mode === 'reset'
                ? 'Send Reset Link'
                : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'reset' ? 'signin' : 'reset')
              setError('')
              setInfo('')
            }}
            className="text-emerald-300 hover:text-emerald-200 text-sm underline"
          >
            {mode === 'reset' ? '← Back to sign-in' : 'Forgot password?'}
          </button>
        </div>
      </div>
    </div>
  )
}
