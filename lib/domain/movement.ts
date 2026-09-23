import { computeRatings, type GameRecord, type PlayerRating } from './ratings'

/** A GameRecord plus the ISO timestamp needed to tell an old game from a recent one. */
export type TimedGameRecord = GameRecord & { createdAt: string }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Standard competition ranking (1, 1, 3 — never 1, 2, 3) so two players tied
 * on ordinal land on the exact same rank instead of an arbitrary order that
 * would depend on Map iteration order.
 */
function ranksOf(ratings: Map<string, PlayerRating>): Map<string, number> {
  const values = [...ratings.values()]
  const ranks = new Map<string, number>()
  for (const r of values) {
    const better = values.filter((o) => o.ordinal > r.ordinal).length
    ranks.set(r.playerId, better + 1)
  }
  return ranks
}

/**
 * The highest `ord` among games created before `cutoffMs`, or null if none
 * exist. `ord` (not `created_at`) is the authoritative chronological order —
 * see the GameRecord.ord doc comment in lib/domain/ratings.ts and
 * lib/domain/game-log.ts's groupByNight, which distrusts created_at for the
 * same reason (clock skew, a late backfill, an offline-queue drain landing
 * out of order). Filtering games directly on `created_at < cutoff` can
 * produce a non-contiguous subset of `ord`s — a rating state that never
 * actually existed. Finding the boundary `ord` this way and then taking
 * every game with `ord <= boundary` guarantees the replayed set is a
 * genuine prefix of history, even if a handful of "old" and "new" games are
 * interleaved by timestamp.
 */
function ordCutoff(games: TimedGameRecord[], cutoffMs: number): number | null {
  let boundary: number | null = null
  for (const g of games) {
    if (new Date(g.createdAt).getTime() < cutoffMs && (boundary === null || g.ord > boundary)) {
      boundary = g.ord
    }
  }
  return boundary
}

/**
 * How many places each player has moved in the standings over the trailing
 * `windowMs` (default 7 days). `currentRatings` is the *already-computed*
 * full-history rating map (the rankings page reuses getRatings()'s cached
 * result here, rather than replaying every game a second time — only the
 * "before" snapshot needs its own replay, over the ord-prefix of games
 * older than the cutoff).
 *
 * Positive means moved up (toward #1), negative means moved down, and zero
 * means no change — including a player who didn't play but was passed by
 * someone who did. A player absent from the old replay (no live games
 * before the cutoff, e.g. they just joined) maps to `null`: there is no
 * "before" standings to compare against, so no arrow should render. A
 * player whose only appearance is a voided game never enters either replay
 * at all, so they are absent from the returned map entirely.
 */
export function computeMovement(
  games: TimedGameRecord[],
  currentRatings: Map<string, PlayerRating>,
  now: Date | number = Date.now(),
  windowMs: number = WEEK_MS,
): Map<string, number | null> {
  const cutoff = (typeof now === 'number' ? now : now.getTime()) - windowMs
  const boundary = ordCutoff(games, cutoff)
  const oldGames = boundary === null ? [] : games.filter((g) => g.ord <= boundary)

  const currentRanks = ranksOf(currentRatings)
  const oldRanks = ranksOf(computeRatings(oldGames))

  const out = new Map<string, number | null>()
  for (const [playerId, newRank] of currentRanks) {
    const oldRank = oldRanks.get(playerId)
    out.set(playerId, oldRank === undefined ? null : oldRank - newRank)
  }
  return out
}
