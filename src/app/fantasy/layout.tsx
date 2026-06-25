// Hide the global floating "Get the Fantasy League App" CTA on /fantasy routes —
// users on these pages are already engaged with fantasy stats; no need to nudge.
export default function FantasyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`#floating-fantasy-cta { display: none !important; }`}</style>
      {children}
    </>
  )
}
