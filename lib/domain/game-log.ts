/**
 * Groups the game log by night (session), newest night first, with each
 * night's games newest first. Pure and DB-agnostic so it's cheap to test —
 * see tests/game-log.test.ts.
 */

/**
 * Shedquarters has exactly one time zone — Los Angeles, where it plays — so
 * every date in the app is pinned there rather than to UTC or to whatever
 * zone the server happens to run in: a 9pm-PDT Friday game is 04:00 UTC
 * Saturday, and calling that Saturday would be wrong, not just a rendering
 * quirk. One constant, one convention — `formatNightDate` (lib/ui/format.ts)
 * and the Ghost badge's day counting (lib/domain/badges.ts) both read it
 * from here rather than each hardcoding a zone of their own.
 */
export const SHED_TIME_ZONE = 'America/Los_Angeles'

type Nightly = { ord: number; sessionId: string; createdAt: string }

export type NightGroup<T> = {
  sessionId: string
  /** ISO timestamp of the earliest game in the night, used for the heading. */
  date: string
  /** Newest game first. */
  games: T[]
}

export function groupByNight<T extends Nightly>(games: T[]): NightGroup<T>[] {
  const bySession = new Map<string, T[]>()
  for (const g of games) {
    const list = bySession.get(g.sessionId)
    if (list) list.push(g)
    else bySession.set(g.sessionId, [g])
  }

  const groups: NightGroup<T>[] = Array.from(bySession.entries()).map(([sessionId, list]) => {
    // Newest game first within the night. `ord` is the trustworthy global
    // order (see GameRecord.ord in lib/domain/ratings.ts) — sort on it
    // rather than createdAt so this can't be thrown off by clock skew.
    const nightGames = [...list].sort((a, b) => b.ord - a.ord)
    const date = nightGames.reduce(
      (earliest, g) => (g.createdAt < earliest ? g.createdAt : earliest),
      nightGames[0].createdAt,
    )
    return { sessionId, date, games: nightGames }
  })

  // Newest night first, keyed off each night's highest ord (its most recent
  // game) rather than a timestamp, for the same reason as above.
  groups.sort((a, b) => b.games[0].ord - a.games[0].ord)
  return groups
}

/**
 * A voided game didn't happen for scoring purposes, so it must not inflate
 * a displayed count (top-of-page total, or a night's own count) — even
 * though the row itself still shows, struck through and labelled.
 */
export function liveGameCount<T extends { voided: boolean }>(games: T[]): number {
  return games.filter((g) => !g.voided).length
}

/**
 * Trims a page fetched with one extra row down to `limit`, and reports
 * whether that extra row existed — i.e. whether there's more beyond this
 * page. Fetching `limit + 1` and checking for the spare row (rather than
 * checking `rows.length === limit`) means a house that has logged exactly
 * `limit` games ever doesn't get a false "older games not shown" banner.
 */
export function capGameLog<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  if (rows.length <= limit) return { rows, truncated: false }
  return { rows: rows.slice(0, limit), truncated: true }
}
