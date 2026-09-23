import { TopBar } from './TopBar'

/**
 * Instant placeholder while a tab's server data loads, so a tap on the tab
 * bar responds immediately instead of waiting on the database.
 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <main aria-busy="true" aria-label="Loading">
      <TopBar />
      <div className="motion-safe:animate-pulse">
        <div className="mt-3 h-11 w-3/5 rounded-lg bg-cream/8" />
        <div className="mt-2 h-11 w-2/5 rounded-lg bg-gold/15" />
        <div className="mt-7 flex flex-col gap-2">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-cream/5" />
          ))}
        </div>
      </div>
    </main>
  )
}
