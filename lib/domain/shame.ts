import type { Streak } from './stats'

/** Below this many players with a real (non-provisional) rating, "last place" is an accident, not a field. */
export const MIN_NON_PROVISIONAL_FOR_CURSED = 4

/**
 * Below this many games, a single blowout (or a two-game losing streak) can
 * dominate a career-long stat. Shared by the "skid" and "diff" slots — a
 * two-game losing streak is exactly as much of an accident as a one-game
 * differential.
 */
export const MIN_GAMES_FOR_SHAME = 5

/** A losing streak shorter than this isn't a "skid," it's a Tuesday. */
export const MIN_SKID_LENGTH = 2

export type ShamePlayer = {
  playerId: string
  ordinal: number
  provisional: boolean
  games: number
  streak: Streak | null
  differentialTotal: number
}

export type ShameEntry =
  | { slot: 'skid'; playerId: string; streakLength: number }
  | { slot: 'diff'; playerId: string; total: number }
  | { slot: 'cursed'; playerId: string; ordinal: number }

/**
 * Picks the "Shed of shame" entries from a season's players: the longest
 * active losing streak, the worst point differential, and last place among
 * players with enough games to have earned it. Each slot is independently
 * gated on having real history behind it (see the MIN_* constants above) and
 * is omitted, not faked, when nothing qualifies.
 *
 * A player can occupy at most one slot. Slots are resolved in priority
 * order — skid, then differential, then cursed — and a player already
 * claimed by an earlier slot is skipped in favor of the next-worst eligible
 * player for a later slot, rather than leaving that slot empty. Within a
 * single slot, a tie on the slot's own metric goes to the worse (lower
 * ordinal) player, not whichever player happens to sort first.
 */
export function shedOfShame(players: ShamePlayer[]): ShameEntry[] {
  const taken = new Set<string>()
  const entries: ShameEntry[] = []

  const skid = [...players]
    .filter(
      (p): p is ShamePlayer & { streak: Streak & { result: 'L' } } =>
        p.streak !== null &&
        p.streak.result === 'L' &&
        p.streak.length >= MIN_SKID_LENGTH &&
        p.games >= MIN_GAMES_FOR_SHAME,
    )
    .sort((a, b) => b.streak.length - a.streak.length || a.ordinal - b.ordinal)
    .find((p) => !taken.has(p.playerId))
  if (skid) {
    taken.add(skid.playerId)
    entries.push({ slot: 'skid', playerId: skid.playerId, streakLength: skid.streak.length })
  }

  const diff = [...players]
    .filter((p) => p.games >= MIN_GAMES_FOR_SHAME && p.differentialTotal < 0)
    .sort((a, b) => a.differentialTotal - b.differentialTotal || a.ordinal - b.ordinal)
    .find((p) => !taken.has(p.playerId))
  if (diff) {
    taken.add(diff.playerId)
    entries.push({ slot: 'diff', playerId: diff.playerId, total: diff.differentialTotal })
  }

  const nonProvisional = players.filter((p) => !p.provisional)
  if (nonProvisional.length >= MIN_NON_PROVISIONAL_FOR_CURSED) {
    const cursed = [...nonProvisional]
      .sort((a, b) => a.ordinal - b.ordinal)
      .find((p) => !taken.has(p.playerId))
    if (cursed) {
      taken.add(cursed.playerId)
      entries.push({ slot: 'cursed', playerId: cursed.playerId, ordinal: cursed.ordinal })
    }
  }

  return entries
}
