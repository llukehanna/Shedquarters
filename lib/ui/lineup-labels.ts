import { firstEmptySlot, sideOf, slotNumber, type Lineup, type LineupSize } from '@/lib/domain/lineup'

/**
 * The words the lineup editor puts on a slot.
 *
 * Kept out of `components/LineupEditor.tsx` because these are the strings a
 * screen reader hears, and a label that promises an action the tap will not
 * perform is the accessibility equivalent of a wrong button. They are pure
 * string-building over a `Lineup`, so they belong where they can be tested
 * branch by branch rather than inside a component nothing can render here.
 */

export const SIDE_LABEL = { holders: 'Holding the table', challengers: 'Challengers' } as const

export function sideLabel(size: LineupSize, index: number): string {
  return SIDE_LABEL[sideOf(size, index)]
}

/** "Holding the table, slot 2" — how every label and announcement names a slot. */
export function slotLabel(size: LineupSize, index: number): string {
  return `${sideLabel(size, index)}, slot ${slotNumber(size, index)}`
}

/**
 * The accessible name for a roster chip: exactly what tapping it will do to
 * the board as it stands, never a generic "select this player".
 *
 * `nameOf` resolves a player id to what the roster calls them, so this stays
 * free of the player list.
 */
export function rosterTapLabel(lineup: Lineup, id: string, nameOf: (id: string) => string): string {
  const who = nameOf(id)
  const at = lineup.slots.indexOf(id)
  const active = lineup.active

  if (active !== null) {
    // Aiming at the slot they already stand in: the tap is a no-op.
    if (at === active) return `${who} is already in ${slotLabel(lineup.size, active)}`
    const standingThere = lineup.slots[active] ?? null
    const occupant = standingThere === null ? null : nameOf(standingThere)
    if (at === -1) {
      // Coming in off the roster — either into a gap, or over somebody.
      return occupant === null
        ? `Put ${who} in ${slotLabel(lineup.size, active)}`
        : `Put ${who} in ${slotLabel(lineup.size, active)}, replacing ${occupant}`
    }
    // Already on the board, so the two slots trade rather than duplicate.
    return occupant === null
      ? `Move ${who} to ${slotLabel(lineup.size, active)}`
      : `Swap ${who} with ${occupant}`
  }

  // Nothing aimed at: the tap either takes them off, or fills the first gap.
  if (at !== -1) return `Take ${who} off ${slotLabel(lineup.size, at)}`
  const empty = firstEmptySlot(lineup)
  return empty === null
    ? `No empty slot for ${who} — tap a slot first`
    : `Put ${who} in ${slotLabel(lineup.size, empty)}`
}
