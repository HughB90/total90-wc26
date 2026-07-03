// Predictor layout:
//   1) Hides the site-wide floating green "Get the Fantasy League App" pill,
//      because it overlapped the sticky Submit button on pick pages.
//   2) Renders a fubotv-style banner ad (inline, full-width) that promotes
//      the Total90 Fantasy iOS app instead. Non-blocking, dismissible-feel,
//      lives above the tab bar so it doesn't cover interactive UI.
import type { ReactNode } from 'react'
import FantasyAppAdBanner from '@/components/predictor/FantasyAppAdBanner'

export default function PredictorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`#floating-fantasy-cta { display: none !important; }`}</style>
      <FantasyAppAdBanner />
      {children}
    </>
  )
}
