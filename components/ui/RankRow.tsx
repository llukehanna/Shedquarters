import Link from 'next/link'
import { Pill } from './Pill'
import { formatMovement, formatMovementLabel, formatStreak } from '@/lib/ui/format'
import type { Streak } from '@/lib/domain/stats'

/** The ESPN-style standings row. #1 wears the panel colour and the Shed of the Table badge. */
export function RankRow({
  rank,
  name,
  rating,
  record,
  href,
  first = false,
  provisional = false,
  streak = null,
  movement = null,
}: {
  rank: number
  name: string
  rating: string
  record: string
  href: string
  first?: boolean
  provisional?: boolean
  /** Current run of results, most recent first. Null renders nothing. */
  streak?: Streak | null
  /** Places moved in the last 7 days. Null (absent from the old standings) renders nothing. */
  movement?: number | null
}) {
  return (
    <Link
      href={href}
      className={`mb-[5px] flex min-h-12 items-center overflow-hidden rounded-[7px] pr-3 ${first ? 'panel min-h-[54px]' : 'surface'} ${provisional ? 'opacity-60' : ''}`}
    >
      <span
        className={`flex w-11 self-stretch items-center justify-center border-r font-display text-[21px] font-extrabold ${first ? 'border-accent/35 text-white' : 'border-accent/12 text-accent'}`}
      >
        {rank}
      </span>
      <span className="ml-3 min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-[19px] font-bold uppercase">{name}</span>
          {first && <Pill tone="accent">Shed of the Table</Pill>}
          {provisional && <Pill tone="dim">Provisional</Pill>}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted">{record}</span>
          {streak && (
            <span
              className={`font-display text-[12px] font-extrabold uppercase ${
                first ? 'text-fg' : streak.result === 'W' ? 'text-up' : 'text-down'
              }`}
            >
              {/* text-up and text-down are both too close to the #1 row's
                  cardinal-red panel to reliably clear 4.5:1 (text-down is
                  ~1.3:1; text-up itself dips to ~4.1:1 against the lighter
                  end of the panel's gradient — checked, not just assumed),
                  so `first` swaps either for text-fg instead. */}
              {formatStreak(streak)}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-[15px] font-bold">{rating}</span>
        {movement !== null && (
          <span
            className={`font-mono text-[11px] font-bold ${
              first ? 'text-fg' : movement > 0 ? 'text-up' : movement < 0 ? 'text-down' : 'text-muted'
            }`}
          >
            {/* None of text-up/text-down/text-faint reliably clear 4.5:1 on
                the #1 row's cardinal-red panel — text-up itself only checks
                out to ~4.1:1 at the panel's lighter end — so `first` is
                checked first and always swaps to text-fg there. Off the
                panel, the no-change case uses text-muted rather than
                text-faint (~2.2:1 on `surface`, same fix as the shame-board
                label). */}
            <span aria-hidden="true">{formatMovement(movement)}</span>
            <span className="sr-only">{formatMovementLabel(movement)}</span>
          </span>
        )}
      </span>
    </Link>
  )
}
