import { describe, it, expect } from 'vitest'
import { computeMovement, type TimedGameRecord } from '@/lib/domain/movement'
import { computeRatings } from '@/lib/domain/ratings'

const NOW = Date.parse('2026-09-18T00:00:00.000Z')
// Comfortably more than 7 days before NOW.
const OLD_TS = '2026-09-01T00:00:00.000Z'
// Within the last 7 days before NOW.
const NEW_TS = '2026-09-17T00:00:00.000Z'

function g(
  ord: number,
  teamA: string[],
  teamB: string[],
  winner: 'a' | 'b',
  createdAt: string,
): TimedGameRecord {
  return {
    ord,
    teamA,
    teamB,
    winner,
    scoreA: winner === 'a' ? 21 : 10,
    scoreB: winner === 'a' ? 10 : 21,
    voided: false,
    createdAt,
  }
}

/** Helper matching how the rankings page actually calls this: the "current"
 * ratings are a real full replay (standing in for getRatings()'s cached
 * result), passed in rather than recomputed inside computeMovement. */
function movementOf(games: TimedGameRecord[], now: Date | number = NOW, windowMs?: number) {
  return computeMovement(games, computeRatings(games), now, windowMs)
}

describe('computeMovement', () => {
  it('gives no arrow to a player with no games before the cutoff', () => {
    const games = [
      g(1, ['p1'], ['p2'], 'a', OLD_TS),
      g(2, ['p3'], ['p4'], 'a', NEW_TS),
    ]
    const movement = movementOf(games)
    expect(movement.get('p3')).toBeNull()
    expect(movement.get('p4')).toBeNull()
    // p1/p2 did exist before the cutoff, so they get a real (possibly zero) delta.
    expect(movement.get('p1')).not.toBeNull()
    expect(movement.get('p2')).not.toBeNull()
  })

  it('shows an arrow for a player who has not played recently but was passed by others', () => {
    const oldGames = [g(1, ['p1'], ['x'], 'a', OLD_TS)]
    const newGames = [
      g(2, ['p2'], ['y'], 'a', NEW_TS),
      g(3, ['p2'], ['y'], 'a', NEW_TS),
      g(4, ['p2'], ['y'], 'a', NEW_TS),
    ]
    const games = [...oldGames, ...newGames]

    // Confirm the fixture actually produces the scenario under test: p2 must
    // overtake p1 in the full replay even though p1 never plays again.
    const final = computeRatings(games)
    expect(final.get('p2')!.ordinal).toBeGreaterThan(final.get('p1')!.ordinal)

    const movement = movementOf(games)
    // p1 was alone at the top of the old (2-player) standings (rank 1) and
    // drops to rank 2 once p2 overtakes them in the full replay.
    expect(movement.get('p1')).toBe(-1)
  })

  it('gives nobody an arrow when the season just started (no games before the cutoff)', () => {
    const games = [
      g(1, ['p1'], ['p2'], 'a', NEW_TS),
      g(2, ['p3'], ['p4'], 'a', NEW_TS),
    ]
    const movement = movementOf(games)
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      expect(movement.get(id)).toBeNull()
    }
  })

  it('shows no movement for anyone in a week with no games at all', () => {
    const games = [
      g(1, ['p1'], ['p2'], 'a', OLD_TS),
      g(2, ['p3'], ['p4'], 'a', OLD_TS),
    ]
    const movement = movementOf(games)
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      expect(movement.get(id)).toBe(0)
    }
  })

  it('treats players tied on rating as the same rank, not an arbitrary order', () => {
    // Two independent, structurally identical pods produce bit-identical
    // ratings: p1 ties p3, and p2 ties p4, in the old standings.
    const oldGames = [g(1, ['p1'], ['p2'], 'a', OLD_TS), g(2, ['p3'], ['p4'], 'a', OLD_TS)]
    const oldOnly = computeRatings(oldGames)
    expect(oldOnly.get('p1')!.ordinal).toBeCloseTo(oldOnly.get('p3')!.ordinal, 10)
    expect(oldOnly.get('p2')!.ordinal).toBeCloseTo(oldOnly.get('p4')!.ordinal, 10)

    // p1 then beats p3 after the cutoff, breaking their tie. p2 and p4 never
    // play again and stay tied with each other at the bottom.
    const games = [...oldGames, g(3, ['p1'], ['p3'], 'a', NEW_TS)]
    const movement = movementOf(games)

    expect(movement.get('p1')).toBe(0) // was tied for rank 1, still rank 1
    expect(movement.get('p3')).toBe(-1) // was tied for rank 1, now strictly below p1
    expect(movement.get('p2')).toBe(0) // still tied for last with p4
    expect(movement.get('p4')).toBe(0)
  })

  it('ignores voided games when replaying either snapshot', () => {
    const games = [
      g(1, ['p1'], ['p2'], 'a', OLD_TS),
      { ...g(2, ['p3'], ['p4'], 'a', NEW_TS), voided: true },
    ]
    const movement = movementOf(games)
    // The only live game is old, and nothing changes after the cutoff.
    expect(movement.get('p1')).toBe(0)
    expect(movement.get('p2')).toBe(0)
    // p3/p4's only appearance is a voided game, so computeRatings never
    // tracks them at all — they should be absent, not merely null.
    expect(movement.has('p3')).toBe(false)
    expect(movement.has('p4')).toBe(false)
  })

  it('accepts a Date for "now" as well as a timestamp', () => {
    const games = [g(1, ['p1'], ['p2'], 'a', OLD_TS)]
    const movement = movementOf(games, new Date(NOW))
    expect(movement.get('p1')).toBe(0)
  })

  it('excludes a game created exactly at the cutoff instant (the boundary is strictly "before")', () => {
    const cutoffInstant = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString()
    const games = [
      g(1, ['p1'], ['x'], 'a', OLD_TS), // clearly old
      g(2, ['p1'], ['x'], 'b', cutoffInstant), // exactly at the cutoff -> must count as "new"
    ]
    const rankOf = (r: ReturnType<typeof computeRatings>) =>
      (r.get('p1')?.ordinal ?? -Infinity) > (r.get('x')?.ordinal ?? -Infinity) ? 1 : 2

    // If the boundary game were (wrongly) included as "old", the old
    // snapshot would be identical to the current one (both see both games)
    // and movement would always be 0 — too weak a check on its own. Compare
    // against the snapshot that correctly excludes it (game 1 alone) instead.
    const correctOldRatings = computeRatings([games[0]])
    const currentRatings = computeRatings(games)
    expect(rankOf(correctOldRatings)).not.toBe(rankOf(currentRatings))

    const expected = rankOf(correctOldRatings) - rankOf(currentRatings)
    expect(movementOf(games).get('p1')).toBe(expected)
  })

  it('respects a custom windowMs instead of the 7-day default', () => {
    const twoDaysAgo = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString()
    const games = [g(1, ['p1'], ['x'], 'a', twoDaysAgo)]
    // Under the default 7-day window, this game is "new" (no old games at
    // all) -> no arrow.
    expect(movementOf(games).get('p1')).toBeNull()
    // Under a 1-day window, that same game is now "old" -> a real (zero) delta.
    const oneDayMs = 24 * 60 * 60 * 1000
    expect(movementOf(games, NOW, oneDayMs).get('p1')).toBe(0)
  })

  it('keeps the old replay a genuine ord-prefix even when a "new"-timestamped game sits between two "old" ones (clock skew / backfill)', () => {
    // ord is the true chronology; created_at is not trusted for it (see
    // lib/domain/game-log.ts). Game 2 carries a recent timestamp despite
    // sitting between two old-timestamped games by ord. A naive
    // `created_at < cutoff` filter would produce old-games = [1, 3] — not a
    // contiguous prefix — and replay a rating state that never existed. The
    // fix finds the boundary ord (3, the highest ord among old-timestamped
    // games) and takes every ord up to it: [1, 2, 3].
    const games: TimedGameRecord[] = [
      { ...g(1, ['p'], ['q'], 'a', OLD_TS), scoreB: 10 }, // p beats q, 21-10
      { ...g(2, ['q'], ['p'], 'a', NEW_TS), scoreB: 10 }, // q beats p, 21-10 — recent timestamp, but ord sits before game 3
      { ...g(3, ['q'], ['p'], 'a', OLD_TS), scoreB: 19 }, // q beats p again, 21-19
      g(4, ['p'], ['q'], 'a', NEW_TS), // the only genuinely-new game: p beats q
    ]

    const gappyOldRatings = computeRatings([games[0], games[2]]) // wrong: skips ord 2
    const correctOldRatings = computeRatings(games.slice(0, 3)) // right: contiguous [1, 2, 3]
    const rankOf = (ratings: ReturnType<typeof computeRatings>) =>
      ratings.get('p')!.ordinal > ratings.get('q')!.ordinal ? 1 : 2

    // Confirm the fixture actually distinguishes the two implementations —
    // otherwise this test wouldn't catch a regression back to naive filtering.
    const gappyPRank = rankOf(gappyOldRatings)
    const correctPRank = rankOf(correctOldRatings)
    expect(gappyPRank).not.toBe(correctPRank)

    const currentRatings = computeRatings(games)
    const expected = correctPRank - rankOf(currentRatings)
    expect(movementOf(games).get('p')).toBe(expected)
  })

  it('handles a player crossing from provisional to non-provisional within the window', () => {
    // 9 games before the cutoff (still provisional at that snapshot), then a
    // 10th+ game inside the window pushes them past PROVISIONAL_GAMES in the
    // full replay. Movement must still be computed purely from ordinal rank,
    // unaffected by the provisional flag (which computeMovement never even
    // sees — it only receives PlayerRating maps with an ordinal).
    const oldGames = Array.from({ length: 9 }, (_, i) => g(i + 1, ['p1'], ['x'], 'a', OLD_TS))
    const newGames = [g(10, ['p1'], ['x'], 'a', NEW_TS)]
    const games = [...oldGames, ...newGames]

    const oldRatings = computeRatings(oldGames)
    expect(oldRatings.get('p1')!.provisional).toBe(true) // 9 games, still provisional
    const currentRatings = computeRatings(games)
    expect(currentRatings.get('p1')!.provisional).toBe(false) // 10 games, crossed over

    const movement = movementOf(games)
    // Only 2 players (p1, x) throughout, so p1 stays rank 1 regardless —
    // the point is this doesn't throw or return null/undefined.
    expect(movement.get('p1')).toBe(0)
  })
})
