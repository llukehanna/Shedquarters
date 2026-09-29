import { TopBar } from './TopBar'

/**
 * Instant placeholder while a tab's server data loads, so a tap on the tab
 * bar responds immediately instead of waiting on the database. `split` adds
 * the desktop's second column, so a page with one doesn't jump when its data
 * arrives.
 */
export function PageSkeleton({ rows = 6, layout = 'single' }: { rows?: number; layout?: 'single' | 'split' }) {
  return (
    <main aria-busy="true" aria-label="Loading">
      <TopBar />
      <div className="motion-safe:animate-pulse">
        <div className="mt-3 h-11 w-3/5 rounded-lg bg-fg/8 lg:h-14 lg:w-2/5" />
        <div className="mt-2 h-11 w-2/5 rounded-lg bg-accent/15 lg:h-14 lg:w-1/4" />
        <div className={layout === 'split' ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-10' : ''}>
          <div className="mt-7 flex flex-col gap-2">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="h-14 rounded-2xl bg-fg/5" />
            ))}
          </div>
          {layout === 'split' && (
            <div className="mt-7 hidden flex-col gap-6 xl:flex">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-36 rounded-2xl bg-fg/5" />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
