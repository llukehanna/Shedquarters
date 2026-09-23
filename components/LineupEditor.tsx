import type { Player } from '@/lib/queries'
import {
  clearAll,
  emptyCount,
  facingSlot,
  sideOf,
  slotCount,
  swapAcross,
  tapRoster,
  tapSlot,
  type Lineup,
} from '@/lib/domain/lineup'
import { rosterTapLabel, slotLabel } from '@/lib/ui/lineup-labels'

/**
 * The "Change teams" board: two columns of addressable slots, a swap control
 * between each facing pair, and the roster underneath.
 *
 * Tap a slot to aim, tap a name to place. Which side someone is on is the
 * slot they are in, so nothing a tap does can quietly shuffle the other
 * side — see `lib/domain/lineup.ts`, which owns every rule this renders.
 *
 * Fully controlled: the parent holds the lineup and this reports the next
 * one. The screen-reader announcement is controlled too, because the 3v3 /
 * 2v2 toggle lives in the parent's top bar and changes the board from
 * outside this component — a live region owned privately here would stay
 * silent for the one operation that can drop a player.
 */

export function LineupEditor({
  players,
  lineup,
  onChange,
  announcement,
  onAnnounce,
}: {
  players: Player[]
  lineup: Lineup
  onChange: (next: Lineup) => void
  /**
   * What just happened, for a screen reader. The board is a grid of buttons
   * whose meaning is positional, so a placement, a swap or a size change is
   * otherwise a silent change to elements the user is not focused on.
   */
  announcement: string
  onAnnounce: (said: string) => void
}) {
  const name = (id: string | null) => (id === null ? null : (players.find((p) => p.id === id)?.displayName ?? '?'))
  const where = (index: number) => slotLabel(lineup.size, index)

  function apply(next: Lineup, said: string) {
    onAnnounce(said)
    if (next !== lineup) onChange(next)
  }

  function onSlot(index: number) {
    const next = tapSlot(lineup, index)
    const wasActive = lineup.active === index
    apply(
      next,
      wasActive
        ? `${where(index)} emptied. Still selected — tap a name.`
        : `${where(index)} selected, ${name(lineup.slots[index] ?? null) ?? 'empty'}. Tap a name to place.`,
    )
  }

  function onSwap(index: number) {
    const a = name(lineup.slots[index] ?? null) ?? 'Empty slot'
    const b = name(lineup.slots[facingSlot(lineup.size, index)] ?? null) ?? 'empty slot'
    apply(swapAcross(lineup, index), `${a} and ${b} switched sides.`)
  }

  function onName(id: string) {
    const next = tapRoster(lineup, id)
    const who = name(id) ?? '?'
    // Nothing moved: they are already in the slot being aimed at, or the
    // board is full and no slot is aimed at. Saying "placed" here would be
    // a lie, and saying nothing leaves the last message standing.
    if (next === lineup) {
      const at = lineup.slots.indexOf(id)
      apply(
        next,
        at === -1
          ? `Every slot is full. Tap a slot first, then ${who}.`
          : `${who} is already in ${where(at)}.`,
      )
      return
    }
    const landed = next.slots.indexOf(id)
    if (landed === -1) {
      apply(next, `${who} taken off the board.`)
      return
    }
    // Whoever was standing there either traded slots with them or came off.
    const displaced = lineup.slots[landed] ?? null
    const movedTo = displaced === null ? -1 : next.slots.indexOf(displaced)
    const aftermath =
      displaced === null
        ? ''
        : movedTo === -1
          ? ` ${name(displaced)} comes off the board.`
          : ` ${name(displaced)} moves to ${slotLabel(next.size, movedTo)}.`
    apply(next, `${who} in ${where(landed)}.${aftermath}`)
  }

  const activeHint =
    lineup.active === null
      ? 'Tap a slot to aim, or tap a name to fill the first empty one.'
      : `Tap a name for ${where(lineup.active).toLowerCase()}.`

  return (
    <>
      <div role="group" aria-label="Lineup" className="mt-4">
        <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
          <p className="eyebrow text-[11px] text-gold">Holding the table</p>
          <span />
          <p className="eyebrow text-[11px]">Challengers</p>

          {Array.from({ length: lineup.size }, (_, row) => (
            <SlotRow
              key={row}
              lineup={lineup}
              left={row}
              right={row + lineup.size}
              label={(i) => name(lineup.slots[i] ?? null)}
              onSlot={onSlot}
              onSwap={onSwap}
            />
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <p className="flex-1 text-[12px] leading-snug text-muted">{activeHint}</p>
        <button
          type="button"
          onClick={() => apply(clearAll(lineup), 'Board cleared.')}
          disabled={emptyCount(lineup) === slotCount(lineup.size)}
          className="min-h-11 shrink-0 rounded-md px-3 font-display text-[13px] font-bold tracking-[0.1em] text-muted uppercase disabled:opacity-40"
        >
          Clear all
        </button>
      </div>

      <p className="eyebrow mt-3 mb-2">Everyone</p>
      <ul className="flex flex-wrap gap-1.5">
        {players.map((p) => {
          const at = lineup.slots.indexOf(p.id)
          const on = at !== -1
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onName(p.id)}
                aria-pressed={on}
                aria-label={rosterTapLabel(lineup, p.id, (id) => name(id) ?? '?')}
                className={`min-h-11 rounded-full border px-4 font-display text-[17px] font-bold uppercase ${on ? 'border-gold bg-gold text-gold-ink' : 'surface'}`}
              >
                {p.displayName}
              </button>
            </li>
          )
        })}
      </ul>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}

/** One facing pair: a holder slot, the swap control, a challenger slot. */
function SlotRow({
  lineup,
  left,
  right,
  label,
  onSlot,
  onSwap,
}: {
  lineup: Lineup
  left: number
  right: number
  label: (index: number) => string | null
  onSlot: (index: number) => void
  onSwap: (index: number) => void
}) {
  const leftName = label(left)
  const rightName = label(right)
  return (
    <>
      <Slot lineup={lineup} index={left} name={leftName} onTap={onSlot} />
      <button
        type="button"
        onClick={() => onSwap(left)}
        aria-label={`Switch ${leftName ?? 'empty slot'} and ${rightName ?? 'empty slot'} between sides`}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/25 bg-gold/6 text-[17px] text-gold"
      >
        <span aria-hidden>⇄</span>
      </button>
      <Slot lineup={lineup} index={right} name={rightName} onTap={onSlot} />
    </>
  )
}

function Slot({
  lineup,
  index,
  name,
  onTap,
}: {
  lineup: Lineup
  index: number
  name: string | null
  onTap: (index: number) => void
}) {
  const active = lineup.active === index
  const holding = sideOf(lineup.size, index) === 'holders'
  // The active slot is the only *slot* that goes gold, so it reads as the
  // live cursor against the cardinal the holding side wears and the neutral
  // fill the challengers get. (Gold is the app's accent generally — the size
  // toggle, the on-board roster chips and Save all use it — but nothing else
  // inside the board does.)
  const skin = active
    ? 'border-gold bg-gold/12 text-gold shadow-[0_0_0_3px_rgb(255_204_0/0.16)]'
    : name === null
      ? 'border-dashed border-gold/25 text-muted'
      : holding
        ? 'border-cardinal-hi/70 bg-cardinal-deep/45 text-cream'
        : 'border-gold/15 bg-cream/4 text-cream'

  return (
    <button
      type="button"
      onClick={() => onTap(index)}
      aria-pressed={active}
      aria-label={`${slotLabel(lineup.size, index)}: ${name ?? 'empty'}`}
      className={`flex min-h-14 w-full min-w-0 items-center rounded-[11px] border-[1.5px] px-3 font-display text-[19px] font-bold uppercase ${skin}`}
    >
      <span className="truncate">{name ?? 'Empty'}</span>
    </button>
  )
}
