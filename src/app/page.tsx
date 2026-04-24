import Image from 'next/image'
import Link from 'next/link'

const navLinkStyle = {
  color: '#8899CC',
  textDecoration: 'none',
  fontSize: '0.85rem',
  fontWeight: 600,
  padding: '0.3rem 0.6rem',
  borderRadius: '0.5rem',
  transition: 'color 0.2s',
}

const cards = [
  {
    emoji: '📰',
    title: 'News',
    desc: 'Live World Cup 2026 intel powered by Grok',
    href: '/news',
    active: true,
  },
  {
    emoji: '📊',
    title: 'S³ Ratings',
    desc: 'Sign · Sell · Sack — vote on World Cup players',
    href: '/s3',
    active: true,
  },
  {
    emoji: '🏆',
    title: 'Bracket',
    desc: 'Pick your winners',
    href: '/bracket',
    active: false,
    tag: 'Coming Soon',
  },
  {
    emoji: '⚽',
    title: 'Scores',
    desc: 'Live match results',
    href: '/scores',
    active: false,
    tag: 'Coming Soon',
  },
]

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0F2E' }}>
      {/* Nav */}
      <nav style={{
        borderBottom: '1px solid #1E3A6E',
        padding: '0.875rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: '1100px',
        margin: '0 auto',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
          <Image src="/total90-logo-green.png" alt="Total90" width={32} height={32} style={{ objectFit: 'contain' }} />
          <span style={{ color: '#00E676', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.05em' }}>
            TOTAL90 <span style={{ color: '#FBBF24' }}>WC26</span>
          </span>
        </Link>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <Link href="/news" style={navLinkStyle}>News</Link>
          <Link href="/s3" style={navLinkStyle}>S³ Ratings</Link>
          <span style={{ ...navLinkStyle, color: '#3A4A6E', cursor: 'default' }}>Bracket</span>
          <span style={{ ...navLinkStyle, color: '#3A4A6E', cursor: 'default' }}>Scores</span>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            color: '#FBBF24',
            margin: '0 0 0.75rem',
            lineHeight: 1.15,
          }}>
            ⚽ World Cup 2026 Hub
          </h1>
          <p style={{ color: '#8899CC', fontSize: 'clamp(0.9rem, 2vw, 1.1rem)', margin: 0 }}>
            June 11 – July 19 · The Beautiful Game · Total90 Intelligence
          </p>
        </div>

        {/* Feature Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
        }}>
          {cards.map(card => {
            const cardStyle: React.CSSProperties = {
              backgroundColor: '#0F1C4D',
              border: `1px solid ${card.active ? '#1E3A6E' : '#162040'}`,
              borderRadius: '1.25rem',
              padding: '1.75rem',
              textDecoration: 'none',
              display: 'block',
              opacity: card.active ? 1 : 0.5,
              cursor: card.active ? 'pointer' : 'default',
              transition: 'border-color 0.2s, transform 0.2s',
            }
            const inner = (
              <>
                <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>{card.emoji}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <h2 style={{ color: '#F0F4FF', fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>
                    {card.title}
                  </h2>
                  {card.tag && (
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '1rem',
                      backgroundColor: 'rgba(251,191,36,0.12)',
                      color: '#FBBF24',
                    }}>
                      {card.tag}
                    </span>
                  )}
                </div>
                <p style={{ color: '#8899CC', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>{card.desc}</p>
              </>
            )
            return card.active
              ? <Link key={card.title} href={card.href} style={cardStyle}>{inner}</Link>
              : <div key={card.title} style={cardStyle}>{inner}</div>
          })}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #1E3A6E',
        padding: '1.5rem',
        textAlign: 'center',
        color: '#4A6080',
        fontSize: '0.8rem',
      }}>
        <p style={{ margin: '0 0 0.5rem' }}>© 2026 TOTAL90 LLC</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <a href="https://sessions.total90.com" style={{ color: '#4A6080', textDecoration: 'none' }}>sessions.total90.com</a>
          <a href="https://leaguereg.total90.com" style={{ color: '#4A6080', textDecoration: 'none' }}>leaguereg.total90.com</a>
        </div>
      </footer>
    </div>
  )
}
