import Link from 'next/link'
import { Newspaper, BarChart3, Trophy, Activity } from 'lucide-react'

const cards = [
  {
    Icon: Newspaper,
    color: '#00E676',
    accentBg: 'rgba(0,230,118,0.08)',
    accentBorder: 'rgba(0,230,118,0.25)',
    title: 'News',
    desc: 'Live World Cup 2026 intel powered by Grok AI',
    href: '/news',
    active: true,
  },
  {
    Icon: BarChart3,
    color: '#60A5FA',
    accentBg: 'rgba(96,165,250,0.08)',
    accentBorder: 'rgba(96,165,250,0.25)',
    title: 'S³ Ratings',
    desc: 'Sign · Sell · Sack — vote on World Cup players',
    href: '/s3',
    active: true,
  },
  {
    Icon: Trophy,
    color: '#FBBF24',
    accentBg: 'rgba(251,191,36,0.06)',
    accentBorder: 'rgba(251,191,36,0.15)',
    title: 'Bracket',
    desc: 'Pick your group winners and knockout bracket',
    href: '/bracket',
    active: false,
    tag: 'Coming Soon',
  },
  {
    Icon: Activity,
    color: '#C084FC',
    accentBg: 'rgba(192,132,252,0.06)',
    accentBorder: 'rgba(192,132,252,0.15)',
    title: 'Scores',
    desc: 'Live World Cup 2026 match results',
    href: '/scores',
    active: false,
    tag: 'Coming Soon',
  },
]

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0F2E' }}>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '3rem', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.875rem', marginBottom: '0.875rem' }}>
            <img
              src="/total90-logo-green.png"
              alt="Total90"
              style={{ width: '52px', height: '52px', objectFit: 'contain' }}
            />
            <div style={{ textAlign: 'left' }}>
              <h1 style={{
                fontSize: 'clamp(1.6rem, 5vw, 2.75rem)',
                fontWeight: 900,
                color: '#FBBF24',
                margin: '0 0 0.1rem',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}>
                World Cup 2026
              </h1>
              <p style={{ color: '#00E676', fontWeight: 700, fontSize: 'clamp(0.85rem, 2vw, 1rem)', margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Total90 Hub
              </p>
            </div>
          </div>
          <p style={{ color: '#8899CC', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
            June 11 – July 19, 2026 · USA · Canada · Mexico
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: '2rem', padding: '0.3rem 0.875rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00E676', display: 'inline-block' }} />
            <span style={{ color: '#00E676', fontSize: '0.75rem', fontWeight: 600 }}>Powered by Total90 Intelligence</span>
          </div>
        </div>

        {/* Feature Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1rem',
        }}>
          {cards.map(({ Icon, color, accentBg, accentBorder, title, desc, href, active, tag }) => {
            const cardContent = (
              <div style={{
                backgroundColor: '#0F1C4D',
                border: `1px solid ${active ? accentBorder : '#162040'}`,
                borderRadius: '1.25rem',
                padding: '1.5rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1.1rem',
                opacity: active ? 1 : 0.55,
                cursor: active ? 'pointer' : 'default',
                textDecoration: 'none',
              }}>
                {/* Icon container */}
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: accentBg,
                  border: `1px solid ${accentBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={22} color={color} strokeWidth={1.75} />
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: '#F0F4FF', fontWeight: 700, fontSize: '1rem' }}>{title}</span>
                    {tag && (
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 700, padding: '0.12rem 0.45rem',
                        borderRadius: '1rem', backgroundColor: 'rgba(251,191,36,0.12)', color: '#FBBF24',
                        letterSpacing: '0.03em',
                      }}>
                        {tag}
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#8899CC', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>{desc}</p>
                </div>

                {/* Arrow for active */}
                {active && (
                  <span style={{ color: color, fontSize: '1rem', flexShrink: 0, marginTop: '0.2rem' }}>→</span>
                )}
              </div>
            )

            return active
              ? <Link key={title} href={href} style={{ textDecoration: 'none', display: 'block' }}>{cardContent}</Link>
              : <div key={title}>{cardContent}</div>
          })}
        </div>

        {/* Stats bar */}
        <div style={{
          marginTop: '2.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
        }}>
          {[
            { value: '638', label: 'Players Ranked' },
            { value: '32', label: 'Nations' },
            { value: '48', label: 'Group Matches' },
          ].map(({ value, label }) => (
            <div key={label} style={{
              backgroundColor: '#0F1C4D',
              border: '1px solid #1E3A6E',
              borderRadius: '1rem',
              padding: '1rem',
              textAlign: 'center',
            }}>
              <div style={{ color: '#FBBF24', fontWeight: 900, fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', marginBottom: '0.2rem' }}>{value}</div>
              <div style={{ color: '#4A6080', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #1E3A6E',
        padding: '1.25rem',
        textAlign: 'center',
        color: '#4A6080',
        fontSize: '0.78rem',
      }}>
        <p style={{ margin: '0 0 0.4rem' }}>© 2026 TOTAL90 LLC</p>
        <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center' }}>
          {['sessions.total90.com', 'leaguereg.total90.com'].map(url => (
            <a key={url} href={`https://${url}`} style={{ color: '#4A6080', textDecoration: 'none' }}>{url}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}
