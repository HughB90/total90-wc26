import Link from 'next/link'

export default function ScoresPage() {
  return (
    <div style={{ backgroundColor: '#0A0F2E', minHeight: '100vh', color: '#F0F4FF', fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <nav style={{ borderBottom: '1px solid #1E3A6E', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <Link href="/" style={{ color: '#00E676', fontWeight: 800, textDecoration: 'none', fontSize: '1rem' }}>
          TOTAL90 <span style={{ color: '#FBBF24' }}>WC26</span>
        </Link>
        <span style={{ color: '#4A6080' }}>/</span>
        <span style={{ color: '#8899CC', fontSize: '0.9rem' }}>Scores</span>
      </nav>

      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚽</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FBBF24', margin: '0 0 0.75rem' }}>Live Scores</h1>
        <p style={{ color: '#8899CC', fontSize: '1rem', margin: '0 0 2rem', lineHeight: 1.6 }}>
          Real-time World Cup 2026 match scores and results. Coming June 11, 2026.
        </p>
        <div style={{
          backgroundColor: '#0F1C4D',
          border: '1px solid #1E3A6E',
          borderRadius: '1rem',
          padding: '1.5rem',
          display: 'inline-block',
        }}>
          <p style={{ color: '#4A6080', fontSize: '0.875rem', margin: 0 }}>
            🗓 World Cup kicks off <strong style={{ color: '#FBBF24' }}>June 11, 2026</strong>
          </p>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <Link href="/" style={{
            color: '#00E676',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}>
            ← Back to Hub
          </Link>
        </div>
      </main>
    </div>
  )
}
