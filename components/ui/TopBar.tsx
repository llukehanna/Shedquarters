import { Wordmark } from './Wordmark'
import { Pill } from './Pill'
import { SportPill } from './SportPill'

/**
 * Wordmark on the left, the Die │ Spike pill on the right. A page that shows
 * both sports at once (a player's page) passes its own `right` instead.
 */
export function TopBar({ live, right }: { live?: boolean; right?: React.ReactNode }) {
  return (
    <header className="flex h-12 items-center justify-between">
      <div className="flex items-center gap-2">
        <Wordmark variant="bar" />
        {live && <Pill tone="live">● Live</Pill>}
      </div>
      {right ?? <SportPill />}
    </header>
  )
}
