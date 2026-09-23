import { Wordmark } from './Wordmark'
import { Pill } from './Pill'

export function TopBar({ live, right }: { live?: boolean; right?: React.ReactNode }) {
  return (
    <header className="flex h-12 items-center justify-between">
      <div className="flex items-center gap-2">
        <Wordmark variant="bar" />
        {live && <Pill tone="live">● Live</Pill>}
      </div>
      {right ?? (
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-cardinal font-display text-[15px] font-extrabold italic text-gold shadow-[inset_0_0_0_1.5px_var(--color-gold)]"
        >
          HQ
        </span>
      )}
    </header>
  )
}
