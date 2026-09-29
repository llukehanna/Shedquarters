import { Wordmark } from './Wordmark'
import { Pill } from './Pill'
import { SportPill } from './SportPill'

/**
 * Wordmark on the left, the Die │ Spike pill on the right. On desktop (lg and
 * up) the rail carries both, so only the Live pill and any `right` slot show.
 * A page that shows both sports at once (a player's page) passes its own
 * `right` instead.
 */
export function TopBar({ live, right }: { live?: boolean; right?: React.ReactNode }) {
  return (
    <header className="flex h-12 items-center justify-between lg:h-8">
      <div className="flex items-center gap-2">
        {/* The rail carries the wordmark and the pill from lg up. */}
        <span className="lg:hidden">
          <Wordmark variant="bar" />
        </span>
        {live && <Pill tone="live">● Live</Pill>}
      </div>
      {right ?? (
        <span className="lg:hidden">
          <SportPill />
        </span>
      )}
    </header>
  )
}
