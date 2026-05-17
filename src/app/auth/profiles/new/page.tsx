'use client'

/**
 * /auth/profiles/new — Create a new profile
 * Feature flag: MULTI_PROFILE_ENABLED
 * Requires account session
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewProfilePage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [managerName, setManagerName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }

    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          pin,
          manager_name: managerName.trim(),
          display_name: displayName.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create profile')
        return
      }

      // Success — redirect back to picker
      router.push('/auth/picker')
      router.refresh()

    } catch (err: any) {
      setError('Network error. Please try again.')
      console.error('Profile creation error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-800 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-2">Create Profile</h1>
        <p className="text-blue-200 mb-6">Add a new player to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-blue-100 mb-1">
              First Name *
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Alex"
            />
          </div>

          {/* Manager Name */}
          <div>
            <label htmlFor="managerName" className="block text-sm font-medium text-blue-100 mb-1">
              Manager Name *
            </label>
            <input
              id="managerName"
              type="text"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Alex's All-Stars"
            />
            <p className="text-xs text-blue-300 mt-1">
              This name appears on leaderboards
            </p>
          </div>

          {/* Display Name (optional) */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-blue-100 mb-1">
              Display Name (optional)
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Alex D."
            />
          </div>

          {/* PIN */}
          <div>
            <label htmlFor="pin" className="block text-sm font-medium text-blue-100 mb-1">
              4-Digit PIN *
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="####"
            />
          </div>

          {/* Confirm PIN */}
          <div>
            <label htmlFor="confirmPin" className="block text-sm font-medium text-blue-100 mb-1">
              Confirm PIN *
            </label>
            <input
              id="confirmPin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              required
              className="w-full px-4 py-2 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="####"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create Profile'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="/auth/picker" className="text-blue-300 hover:text-blue-200 text-sm">
            ← Back to profiles
          </a>
        </div>
      </div>
    </div>
  )
}
