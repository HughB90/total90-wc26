'use client'

/**
 * /auth/picker — "Who's playing?" Netflix-style profile picker
 * Feature flag: MULTI_PROFILE_ENABLED
 * Lands here after Tier 3 login (account session, no profile session)
 */

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

interface Profile {
  id: string
  first_name: string
  manager_name: string
  display_name: string | null
  is_owner: boolean
}

export default function ProfilePickerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch profiles on mount
  useEffect(() => {
    async function fetchProfiles() {
      try {
        const res = await fetch('/api/auth/profiles')
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Failed to load profiles')
          setLoading(false)
          return
        }

        setProfiles(data.profiles || [])
      } catch (err) {
        setError('Network error. Please try again.')
        console.error('Error fetching profiles:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchProfiles()
  }, [])

  const selectProfile = async (profileId: string, firstName: string) => {
    // For now, just prompt for PIN and call quick-signin
    // In production, this would be a modal or inline PIN input
    const pin = prompt(`Enter ${firstName}'s 4-digit PIN:`)
    
    if (!pin || pin.length !== 4) {
      alert('PIN must be exactly 4 digits')
      return
    }

    try {
      const res = await fetch('/api/auth/quick-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          pin,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'Incorrect PIN')
        return
      }

      // Success — back to hub (or ?next= deep link)
      router.push(next)
      router.refresh()

    } catch (err) {
      alert('Network error. Please try again.')
      console.error('Profile selection error:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">Loading profiles...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center p-4">
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-red-200 max-w-md">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold text-white mb-8">Who's playing?</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-4xl">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => selectProfile(profile.id, profile.first_name)}
            className="group relative bg-gradient-to-br from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/40 hover:to-teal-500/40 border border-white/20 rounded-xl p-6 transition-all hover:scale-105 hover:shadow-2xl"
          >
            {/* Avatar circle */}
            <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-3xl font-bold">
              {profile.first_name[0].toUpperCase()}
            </div>

            {/* Name */}
            <div className="text-white font-semibold text-lg text-center">
              {profile.display_name || profile.first_name}
            </div>

            {/* Manager name */}
            <div className="text-emerald-300 text-sm text-center mt-1">
              {profile.manager_name}
            </div>

            {/* Owner badge */}
            {profile.is_owner && (
              <div className="absolute top-2 right-2 bg-yellow-500 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                OWNER
              </div>
            )}
          </button>
        ))}

        {/* Add profile button */}
        <a
          href="/auth/profiles/new"
          className="group relative bg-white/5 hover:bg-white/10 border border-dashed border-white/30 rounded-xl p-6 transition-all hover:scale-105 flex flex-col items-center justify-center"
        >
          <div className="w-20 h-20 mb-3 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center text-white text-4xl">
            +
          </div>
          <div className="text-white/70 font-semibold text-center">
            Add Profile
          </div>
        </a>
      </div>

      {/* Sign out */}
      <button
        onClick={async () => {
          await fetch('/api/auth/signout', { method: 'POST' })
          router.push('/')
          router.refresh()
        }}
        className="mt-8 text-white/50 hover:text-white/80 text-sm underline"
      >
        Sign out
      </button>
    </div>
  )
}
