/**
 * The lineup being edited on the "Change teams" screen, as a pure value.
 *
 * The screen this replaced modelled a lineup as one ordered flat list —
 * tap names in order, the first `size` hold the table. That made which side
 * someone is on a function of *where they happened to fall in the tap
 * order*, so removing anyone shifted every later name up a slot, across the
 * team boundary. Swapping one player between sides meant clearing the board
 * and re-tapping all of it in the right order.
 *
 * Here a lineup is a fixed array of addressable slots instead: `size` for
 * the team holding the table, then `size` for the challengers. Every
 * operation writes named indices and nothing else, so changing one slot
 * structurally cannot move a player in another. The functions below are the
 * only way the editor mutates a lineup; `components/LineupEditor.tsx` is
 * rendering and taps, with no lineup arithmetic of its own.
 *
 * Two invariants hold for every value these functions return, given one they
 * produced:
 *   - `slots.length === size * 2`.
 *   - no player id appears in two slots (placing someone who is already on
 *     the board *trades* the two slots rather than cloning them).
 */

/** Matches `TeamSize` in components/ui/TeamSizeToggle — 2v2 or 3v3, nothing else. */
export type LineupSize = 2 | 3

export function isLineupSize(v: unknown): v is LineupSize {
  return v === 2 || v === 3
}

/**
 * What may stand in a slot. The empty string is not a player id: it would
 * read as "filled" everywhere on the screen and then be rejected by
 * `lib/session.ts::setTeams` as an unknown player, long after the board
 * said Save was safe. Every guard in this file goes through here so they
 * cannot drift apart.
 */
function isPlayerId(v: unknown): v is string {
  return typeof v === 'string' && v !== ''
}

export type Side = 'holders' | 'challengers'

export type Lineup = {
  size: LineupSize
  /**
   * Length is always `size * 2`. Indices `0..size-1` hold the table,
   * `size..2*size-1` are the challengers. `null` is an empty slot.
   */
  slots: ReadonlyArray<string | null>
  /**
   * The slot a roster tap lands in, or `null` for "fill the first empty
   * one". Exactly one slot is active at a time — it is an index, not a flag
   * per slot, so two slots cannot both claim the next tap.
   */
  active: number | null
}

export function slotCount(size: LineupSize): number {
  return size * 2
}

export function sideOf(size: LineupSize, index: number): Side {
  return index < size ? 'holders' : 'challengers'
}

/** The slot directly opposite `index` — the one the swap control faces it with. */
export function facingSlot(size: LineupSize, index: number): number {
  return index < size ? index + size : index - size
}

/** 1-based position within its own side, for labelling ("slot 2 of Challengers"). */
export function slotNumber(size: LineupSize, index: number): number {
  return (index % size) + 1
}

function inRange(lineup: Lineup, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < slotCount(lineup.size)
}

function withSlot(slots: ReadonlyArray<string | null>, index: number, id: string | null): (string | null)[] {
  const next = [...slots]
  next[index] = id
  return next
}

/**
 * Build a lineup from two rosters — normally the live table, so the editor
 * opens on who is actually playing. Short rosters leave empty slots, long
 * ones are cut to fit, and a player named on both sides is kept only in the
 * first slot that claimed them (the duplicate becomes an empty slot rather
 * than a second copy).
 */
export function createLineup(
  size: LineupSize,
  holders: readonly string[],
  challengers: readonly string[],
): Lineup {
  const seen = new Set<string>()
  const fill = (roster: readonly string[]): (string | null)[] =>
    Array.from({ length: size }, (_, i) => {
      const id = roster[i]
      if (!isPlayerId(id) || seen.has(id)) return null
      seen.add(id)
      return id
    })
  return { size, slots: [...fill(holders), ...fill(challengers)], active: null }
}

/**
 * Tap a slot. A slot that was not active becomes the active one; tapping the
 * active slot again empties it and *stays* active, so the next roster tap
 * refills it without a second trip to the slot.
 */
export function tapSlot(lineup: Lineup, index: number): Lineup {
  if (!inRange(lineup, index)) return lineup
  if (lineup.active === index) return { ...lineup, slots: withSlot(lineup.slots, index, null) }
  return { ...lineup, active: index }
}

/**
 * Put `id` in slot `index`.
 *
 * If they already stand in another slot, that slot takes whoever `index` was
 * holding — the two trade places. This is what makes "no duplicates" a
 * property of the model rather than something the screen has to police, and
 * it is also the behaviour you want: naming someone who is already on the
 * other side is the same gesture as asking those two to switch.
 *
 * Exactly one or two slots change. No third player moves, ever.
 */
export function placeInSlot(lineup: Lineup, index: number, id: string): Lineup {
  if (!inRange(lineup, index)) return lineup
  const from = lineup.slots.indexOf(id)
  if (from === index) return lineup
  const slots = withSlot(lineup.slots, index, id)
  if (from !== -1) slots[from] = lineup.slots[index] ?? null
  return { ...lineup, slots }
}

/** Empty one slot, leaving every other slot exactly where it was. */
export function clearSlot(lineup: Lineup, index: number): Lineup {
  if (!inRange(lineup, index)) return lineup
  return { ...lineup, slots: withSlot(lineup.slots, index, null) }
}

/**
 * Send the two facing players across sides in one tap — the "you two
 * switch" case. An empty slot swaps just as happily: the one player crosses
 * over and leaves the empty behind.
 */
export function swapAcross(lineup: Lineup, index: number): Lineup {
  if (!inRange(lineup, index)) return lineup
  const other = facingSlot(lineup.size, index)
  const slots = withSlot(lineup.slots, index, lineup.slots[other] ?? null)
  slots[other] = lineup.slots[index] ?? null
  return { ...lineup, slots }
}

/** Empty every slot. The board is blank, and nothing is active. */
export function clearAll(lineup: Lineup): Lineup {
  return { ...lineup, slots: lineup.slots.map(() => null), active: null }
}

export function firstEmptySlot(lineup: Lineup): number | null {
  const i = lineup.slots.indexOf(null)
  return i === -1 ? null : i
}

/**
 * Tap a name in the roster.
 *
 * With a slot active the name lands there (trading, per `placeInSlot`).
 * With nothing active it fills the first empty slot, so naming a lineup from
 * scratch is still one tap per player — and a name that is already on the
 * board steps off it, which is the only way to empty a slot without first
 * selecting it.
 */
export function tapRoster(lineup: Lineup, id: string): Lineup {
  if (lineup.active !== null) return placeInSlot(lineup, lineup.active, id)
  const at = lineup.slots.indexOf(id)
  if (at !== -1) return clearSlot(lineup, at)
  const empty = firstEmptySlot(lineup)
  return empty === null ? lineup : placeInSlot(lineup, empty, id)
}

/**
 * Switch between 3v3 and 2v2, keeping as many of the players already placed
 * as still fit on their own side rather than wiping the board — going 3v3 →
 * 2v2 → 3v3 costs you only the players the smaller board could not hold.
 * Gaps close up within a side, so a half-filled 3v3 keeps its two names.
 */
export function resize(lineup: Lineup, size: LineupSize): Lineup {
  if (size === lineup.size) return lineup
  const placed = (from: number, to: number): string[] =>
    lineup.slots.slice(from, to).filter((id): id is string => id !== null)
  return createLineup(size, placed(0, lineup.size), placed(lineup.size, slotCount(lineup.size)))
}

/**
 * Whether this board is ready to save. The size and the slot count are
 * checked too, not just the contents: `every` over an empty array is `true`,
 * so a board whose size never came from the toggle (TableMode casts the live
 * table's team size) would otherwise report a complete lineup of nobody.
 */
export function isComplete(lineup: Lineup): boolean {
  return (
    isLineupSize(lineup.size) &&
    lineup.slots.length === slotCount(lineup.size) &&
    lineup.slots.every(isPlayerId)
  )
}

/** How many slots are still empty — what "Fill N more" counts. */
export function emptyCount(lineup: Lineup): number {
  return lineup.slots.filter((id) => !isPlayerId(id)).length
}

/**
 * The players `before` had placed that `after` has no room for. Only a size
 * change can drop anyone — every other operation keeps the board the same
 * shape — and the screen has to be able to say out loud who came off.
 */
export function droppedPlayers(before: Lineup, after: Lineup): string[] {
  return before.slots.filter((id): id is string => isPlayerId(id) && !after.slots.includes(id))
}

/**
 * The two rosters as `lib/session.ts::setTeams` expects them, or `null`
 * while any slot is still empty. Save is the only caller: a lineup with a
 * hole in it has no teams to write, and refusing here means the screen
 * cannot send a short roster even if its own disabled state were wrong.
 */
export function toTeams(lineup: Lineup): { holders: string[]; challengers: string[] } | null {
  if (!isComplete(lineup)) return null
  const ids = lineup.slots.filter(isPlayerId)
  return { holders: ids.slice(0, lineup.size), challengers: ids.slice(lineup.size) }
}

// ---------------------------------------------------------------------------
// Persistence shape
//
// A lineup mid-edit survives a tab switch (see lib/client/persist.ts), so it
// crosses localStorage — hand-editable, and written by whatever version of
// the app the phone last loaded. `active` is deliberately not persisted: it
// is a pointer into a board that a restore has to re-validate anyway, and
// reopening with nothing active is the safe, unsurprising state.
// ---------------------------------------------------------------------------

export type StoredLineup = { size: LineupSize; slots: (string | null)[] }

/**
 * Whether a parsed value is a lineup this app can restore: the right number
 * of slots for its own size, every entry a real player id or null, and no
 * player in two slots at once. Anything else is a cache miss — never a partial
 * restore, because a lineup with a duplicate or a missing slot is exactly
 * the state the slot model exists to make unreachable.
 */
export function isStoredLineup(v: unknown): v is StoredLineup {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (!isLineupSize(o.size)) return false
  if (!Array.isArray(o.slots) || o.slots.length !== slotCount(o.size)) return false
  const seen = new Set<string>()
  for (const id of o.slots) {
    if (id === null) continue
    if (!isPlayerId(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}

export function toStoredLineup(lineup: Lineup): StoredLineup {
  return { size: lineup.size, slots: [...lineup.slots] }
}

export function fromStoredLineup(stored: StoredLineup): Lineup {
  return { size: stored.size, slots: [...stored.slots], active: null }
}
