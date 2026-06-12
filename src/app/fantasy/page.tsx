import { Suspense } from 'react'
import FantasyClient from './FantasyClient'
import AuthHeader from '@/components/AuthHeader'

export const metadata = {
  title: 'Fantasy Stats | Total90 WC26',
  description: 'Live fantasy football stats for FIFA World Cup 2026 with v1.4 scoring',
}

export default function FantasyPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0F2E', color: '#F0F4FF' }}>
      <AuthHeader />
      <Suspense fallback={<LoadingState />}>
        <FantasyClient />
      </Suspense>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '2rem 1rem',
      textAlign: 'center',
    }}>
      <p style={{ color: '#8899CC', fontSize: '0.9rem' }}>Loading fantasy stats...</p>
    </div>
  )
}
