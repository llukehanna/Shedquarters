import { rating, rate, ordinal, type Rating } from 'openskill'
import { TARGET_SCORE } from './score'

/** Score gap at or below which a win to 21 counts as ordinary. Tunable; a replay re-derives everything. */
export const MARGIN = 5

/**
 * `MARGIN` scaled to a game's length, so a shorter game needs a
 * proportionally smaller gap before the scoreline starts to count: 3 for a
 * game to 11, 4 for 15, 5 for 21, 6 for 25. A 11–5 spikeball game is as
 * lopsided as a 21–11 one, not an ordinary win.
 */
export function marginFor(target: number = TARGET_SCORE): number {
  return Math.max(1, Math.round((MARGIN * target) / TARGET_SCORE))
}

/** Games required before a player's rating stops being labelled provisional. */
export const PROVISIONAL_GAMES = 10

export type GameRecord = {
  /**
   * Replay order key. Must be unique across all games passed to `computeRatings`
   * (the `games` table enforces this: `ord bigserial not null unique`). Rating
   * updates are not commutative, so if `ord` were ever non-unique, which game
   * among a tied group replays first would depend on input array order and the
   * result would not be reproducible.
   */
  ord: number
  teamA: string[]
  teamB: string[]
  winner: 'a' | 'b'
  scoreA: number
  scoreB: number
  voided: boolean
  /** What the game was played to. Absent means 21, which is every game from before there was a choice. */
  targetScore?: number
}

export type PlayerRating = {
  playerId: string
  mu: number
  sigma: number
  ordinal: number
  games: number
  wins: number
  provisional: boolean
}

type Tally = { rating: Rating; games: number; wins: number }

/**
 * Deterministic content-derived tie-breaker for the replay sort. `ord` is
 * required to be unique (see `GameRecord.ord`), so this key should never
 * actually need to break a tie in practice — but the comparator must still be
 * total: `Array.prototype.sort` is only stable relative to *input* order, and
 * two callers could pass the same rows in different array orders. Deriving
 * the key from the game's own content (never from array position) means the
 * sort output cannot depend on input order even in that scenario.
 */
function sortKey(g: GameRecord): string {
  return JSON.stringify([g.teamA, g.teamB, g.winner, g.scoreA, g.scoreB, g.voided])
}

/** Throws if a game's declared winner/scores are inconsistent or a player appears twice. */
function assertValidGame(g: GameRecord): void {
  const seen = new Set<string>()
  for (const id of [...g.teamA, ...g.teamB]) {
    if (seen.has(id)) {
      throw new Error(`Game ord=${g.ord}: player "${id}" appears more than once (teamA/teamB must be disjoint sets of unique ids)`)
    }
    seen.add(id)
  }

  if (g.scoreA === g.scoreB) {
    throw new Error(`Game ord=${g.ord}: scores are tied (${g.scoreA}-${g.scoreB}) but a winner ('${g.winner}') is declared`)
  }
  const aActuallyWon = g.scoreA > g.scoreB
  if ((g.winner === 'a') !== aActuallyWon) {
    throw new Error(
      `Game ord=${g.ord}: winner is declared '${g.winner}' but the score (${g.scoreA}-${g.scoreB}) says the other team scored more`,
    )
  }
}

export type GameDelta = {
  /** Change in the winning team's average ordinal across this game's rating update. */
  winnerDelta: number
  /** Change in the losing team's average ordinal across this game's rating update. */
  loserDelta: number
}

export type ReplayResult = {
  ratings: Map<string, PlayerRating>
  /** Keyed by `ord`; the key already carries the game identity, so `GameDelta` itself does not repeat it. */
  deltas: Map<number, GameDelta>
}

/** 0 for an empty team rather than NaN. `assertValidGame` doesn't reject an
 *  empty team array (nor does lib/session.ts's UI path ever produce one),
 *  but this keeps a future empty-team caller from ever rendering "NaN". */
function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * The full replay: ratings and per-game deltas from a single pass over game
 * history. Exported (rather than kept as a `computeRatings`-only internal)
 * so a caller that wants both — notably `lib/ratings-cache.ts`, which caches
 * this behind a fingerprint — can get them from one scan and one replay
 * instead of running this twice. `computeRatings`'s signature and output are
 * unchanged by this: it still returns only the final ratings map.
 */
export function computeRatingsAndDeltas(games: GameRecord[], opts: { margin?: number } = {}): ReplayResult {
  const tallies = new Map<string, Tally>()
  const deltas = new Map<number, GameDelta>()

  const get = (id: string): Tally => {
    let t = tallies.get(id)
    if (!t) {
      t = { rating: rating(), games: 0, wins: 0 }
      tallies.set(id, t)
    }
    return t
  }

  const ordered = games
    .filter((g) => !g.voided)
    .sort((x, y) => x.ord - y.ord || sortKey(x).localeCompare(sortKey(y)))

  for (const g of ordered) {
    assertValidGame(g)

    const aWon = g.winner === 'a'
    const winners = aWon ? g.teamA : g.teamB
    const losers = aWon ? g.teamB : g.teamA
    const winScore = aWon ? g.scoreA : g.scoreB
    const loseScore = aWon ? g.scoreB : g.scoreA

    const preWinnerOrdinals = winners.map((id) => ordinal(get(id).rating))
    const preLoserOrdinals = losers.map((id) => ordinal(get(id).rating))

    // rate() derives rank from `score` (higher score = better rank) and ignores
    // array position whenever `score` is supplied — see openskill's rate.ts,
    // `rank = options.rank ?? options.score?.map(p => -p) ?? range(...)`. The
    // winners-first array order below is kept only for readability; it is the
    // `score` array, not position, that actually determines who is rated as
    // the winner.
    const [ratedWinners, ratedLosers] = rate(
      [winners.map((id) => get(id).rating), losers.map((id) => get(id).rating)],
      { score: [winScore, loseScore], margin: opts.margin ?? marginFor(g.targetScore) },
    )

    winners.forEach((id, i) => {
      const t = get(id)
      t.rating = ratedWinners[i]
      t.games += 1
      t.wins += 1
    })
    losers.forEach((id, i) => {
      const t = get(id)
      t.rating = ratedLosers[i]
      t.games += 1
    })

    deltas.set(g.ord, {
      winnerDelta: average(ratedWinners.map((r, i) => ordinal(r) - preWinnerOrdinals[i])),
      loserDelta: average(ratedLosers.map((r, i) => ordinal(r) - preLoserOrdinals[i])),
    })
  }

  const out = new Map<string, PlayerRating>()
  for (const [playerId, t] of tallies) {
    out.set(playerId, {
      playerId,
      mu: t.rating.mu,
      sigma: t.rating.sigma,
      ordinal: ordinal(t.rating),
      games: t.games,
      wins: t.wins,
      provisional: t.games < PROVISIONAL_GAMES,
    })
  }
  return { ratings: out, deltas }
}

export function computeRatings(
  games: GameRecord[],
  opts: { margin?: number } = {},
): Map<string, PlayerRating> {
  return computeRatingsAndDeltas(games, opts).ratings
}

/**
 * Per-game rating movement from the same replay `computeRatings` runs, keyed
 * by `ord`. A voided game has no entry — it moved nothing. One call replays
 * the whole history once and returns every game's deltas, rather than
 * re-replaying per row.
 */
export function computeRatingDeltas(
  games: GameRecord[],
  opts: { margin?: number } = {},
): Map<number, GameDelta> {
  return computeRatingsAndDeltas(games, opts).deltas
}
