export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', color: '#F0F4FF', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <h1 style={{ color: '#00E676', fontWeight: 900, fontSize: '1.75rem', marginBottom: '0.5rem' }}>Privacy Policy</h1>
        <p style={{ color: '#8899CC', fontSize: '0.85rem', marginBottom: '2rem' }}>Last updated: May 2026 · Total90 LLC</p>
        
        {[
          { title: 'What we collect', body: 'When you use WC2026.total90.com, we collect anonymous usage data including pages visited, features used, and voting activity. If you create a Bracket Challenge account, we collect your first name, team name, and a hashed PIN. We do not collect passwords, payment information, or personally identifiable information on this site.' },
          { title: 'How we use it', body: 'Usage data is used to improve the site experience and understand which features people find useful. Bracket data (team name, picks, scores) is used to run the leaderboard. We do not sell your data to third parties.' },
          { title: 'Cookies and storage', body: 'We use browser sessionStorage to remember which players you have voted on during your visit. No persistent cookies are used for tracking purposes. Vercel Analytics may use anonymous session data to measure traffic.' },
          { title: 'Third-party services', body: 'We use Vercel (hosting and analytics), Supabase (database), and flagcdn.com (flag images). Player photos are sourced from SoFIFA CDN. Each service has its own privacy policy.' },
          { title: 'Data retention', body: 'Bracket picks and vote counts are stored until you request deletion. You can request deletion of your account data by contacting us.' },
          { title: 'Contact', body: 'Questions? Email hugh@total90.com' },
        ].map(({ title, body }) => (
          <div key={title} style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ color: '#FBBF24', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{title}</h2>
            <p style={{ color: '#8899CC', lineHeight: 1.7, margin: 0, fontSize: '0.9rem' }}>{body}</p>
          </div>
        ))}

        <div style={{ borderTop: '1px solid #1E3A6E', paddingTop: '1.5rem', marginTop: '2rem' }}>
          <a href="/" style={{ color: '#00E676', textDecoration: 'none', fontSize: '0.85rem' }}>← Back to Total90 WC26</a>
        </div>
      </div>
    </div>
  )
}
