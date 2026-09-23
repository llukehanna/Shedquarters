import type { GameRecord } from '@/lib/domain/ratings'

export type RunRecord = { roster: string[]; length: number }

export type CarryRecord = {
  playerId: string
  teammateId: string
  withRate: number
  withoutRate: number
  delta: number
  withGames: number
  withoutGames: number
}

/**
 * Non-voided games sorted oldest-first. Exported so callers that need
 * several per-player computations over the same game list (the rankings
 * page: every player's streak, then every player's differential) can sort
 * once and pass the result to the `*FromLive` variants below, instead of
 * paying an O(n log n) sort per player per computation.
 *
 * Generic in the row type so a caller holding something wider than a bare
 * `GameRecord` — lib/domain/badges.ts needs each game's timestamp — gets its
 * own shape back instead of having to cast the widening away. Nothing about
 * the filter or the sort changes with the row type.
 */
export function liveGames<T extends GameRecord>(games: T[]): T[] {
  return games.filter((x) => !x.voided).slice().sort((a, b) => a.ord - b.ord)
}

const key = (roster: string[]) => [...roster].sort().join('|')

export function longestRuns(games: GameRecord[]): RunRecord[] {
  const runs: RunRecord[] = []
  let current: RunRecord | null = null

  for (const g of liveGames(games)) {
    // team_a always holds, so an 'a' result extends the current run.
    if (current && g.winner === 'a' && key(g.teamA) === key(current.roster)) {
      current.length += 1
      continue
    }
    current = { roster: g.winner === 'a' ? g.teamA : g.teamB, length: 1 }
    runs.push(current)
  }
  return runs.sort((a, b) => b.length - a.length)
}

export function mostCarried(games: GameRecord[], minGames = 5): CarryRecord[] {
  const played = liveGames(games)
  const players = new Set(played.flatMap((g) => [...g.teamA, ...g.teamB]))
  const out: CarryRecord[] = []

  for (const p of players) {
    for (const t of players) {
      if (p === t) continue
      let withWins = 0, withTotal = 0, withoutWins = 0, withoutTotal = 0

      for (const g of played) {
        const side = g.teamA.includes(p) ? 'a' : g.teamB.includes(p) ? 'b' : null
        if (!side) continue
        const roster = side === 'a' ? g.teamA : g.teamB
        const won = g.winner === side

        if (roster.includes(t)) {
          withTotal++
          if (won) withWins++
        } else {
          withoutTotal++
          if (won) withoutWins++
        }
      }

      if (withTotal < minGames || withoutTotal < minGames) continue
      const withRate = withWins / withTotal
      const withoutRate = withoutWins / withoutTotal
      out.push({
        playerId: p,
        teammateId: t,
        withRate,
        withoutRate,
        delta: withRate - withoutRate,
        withGames: withTotal,
        withoutGames: withoutTotal,
      })
    }
  }
  return out.sort((x, y) => y.delta - x.delta)
}

export type DifferentialRecord = {
  total: number
  average: number | null
}

/**
 * Sum of (own team's score - opponent's score) across every non-voided game
 * a player appears in, plus the per-game average. A player with no games
 * gets a zero total and a null average (there is nothing to divide by).
 */
export function pointDifferential(games: GameRecord[], playerId: string): DifferentialRecord {
  return pointDifferentialFromLive(liveGames(games), playerId)
}

/**
 * Same as `pointDifferential`, but takes an already-`liveGames`-sorted list
 * so a caller computing this for every player (e.g. the rankings page's
 * shame board) sorts once instead of once per player.
 */
export function pointDifferentialFromLive(liveSorted: GameRecord[], playerId: string): DifferentialRecord {
  let total = 0
  let played = 0

  for (const g of liveSorted) {
    const side = g.teamA.includes(playerId) ? 'a' : g.teamB.includes(playerId) ? 'b' : null
    if (!side) continue
    played++
    total += side === 'a' ? g.scoreA - g.scoreB : g.scoreB - g.scoreA
  }

  return { total, average: played > 0 ? total / played : null }
}

export type Streak = { result: 'W' | 'L'; length: number }

/**
 * The player's current run of consecutive results, most recent game first,
 * counting only non-voided games. Null for a player with no live games.
 */
export function currentStreak(games: GameRecord[], playerId: string): Streak | null {
  return currentStreakFromLive(liveGames(games), playerId)
}

/**
 * Same as `currentStreak`, but takes an already-`liveGames`-sorted list so a
 * caller computing this for every player (the rankings page: once for the
 * row itself, once for the shame board) sorts once instead of once per
 * player per call site.
 */
export function currentStreakFromLive(liveSorted: GameRecord[], playerId: string): Streak | null {
  const played = liveSorted.filter(
    (g) => g.teamA.includes(playerId) || g.teamB.includes(playerId),
  )
  if (played.length === 0) return null

  // liveSorted is oldest-first; walk the filtered copy back-to-front for
  // most-recent-first (filter() already returns a fresh array, so this
  // reverse doesn't mutate the caller's shared liveSorted list).
  played.reverse()

  const resultOf = (g: GameRecord): 'W' | 'L' =>
    (g.teamA.includes(playerId) ? 'a' : 'b') === g.winner ? 'W' : 'L'

  const result = resultOf(played[0])
  let length = 0
  for (const g of played) {
    if (resultOf(g) !== result) break
    length++
  }
  return { result, length }
}

type Meeting = { sameTeam: boolean; aWon: boolean }

/**
 * The shared walk behind `headToHead` and `sameTeamGames`: which side each
 * of two players was on, for every non-voided game where both of them
 * actually appeared. Games where either player is absent aren't meetings at
 * all and are left out entirely, rather than each caller re-deriving that.
 */
function meetings(games: GameRecord[], a: string, b: string): Meeting[] {
  const out: Meeting[] = []

  for (const g of liveGames(games)) {
    const aSide = g.teamA.includes(a) ? 'a' : g.teamB.includes(a) ? 'b' : null
    const bSide = g.teamA.includes(b) ? 'a' : g.teamB.includes(b) ? 'b' : null
    if (!aSide || !bSide) continue
    out.push({ sameTeam: aSide === bSide, aWon: g.winner === aSide })
  }
  return out
}

export function headToHead(
  games: GameRecord[],
  a: string,
  b: string,
): { wins: number; losses: number } {
  let wins = 0, losses = 0

  for (const m of meetings(games, a, b)) {
    if (m.sameTeam) continue
    if (m.aWon) wins++
    else losses++
  }
  return { wins, losses }
}

/**
 * How many non-voided games two players spent as teammates rather than
 * opponents — its own interesting number in a game where teams rotate every
 * round, distinct from `headToHead`'s opposite-team record.
 */
export function sameTeamGames(games: GameRecord[], a: string, b: string): number {
  return meetings(games, a, b).filter((m) => m.sameTeam).length
}

export type HeadToHeadSummary = { wins: number; losses: number; sameTeam: number }

/**
 * `headToHead`'s record and `sameTeamGames`' count together, from a single
 * walk over history — for the h2h page, which wants both and would otherwise
 * pay for `meetings()`'s filter+sort of the whole `games` table twice.
 */
export function headToHeadSummary(games: GameRecord[], a: string, b: string): HeadToHeadSummary {
  let wins = 0, losses = 0, sameTeam = 0

  for (const m of meetings(games, a, b)) {
    if (m.sameTeam) {
      sameTeam++
      continue
    }
    if (m.aWon) wins++
    else losses++
  }
  return { wins, losses, sameTeam }
}

/** Below this many meetings, a head-to-head record is mostly noise. */
export const H2H_MEANINGFUL_GAMES = 8

const SMALL_COUNTS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']

/**
 * A plain-spoken caveat for a head-to-head record's sample size, or null once
 * there's enough history for the record to mean something on its own. Never
 * "small sample" — this talks like a housemate, not a stats footnote.
 */
export function headToHeadNote(totalMeetings: number): string | null {
  if (totalMeetings === 0) return "They haven't played each other yet."
  if (totalMeetings >= H2H_MEANINGFUL_GAMES) return null

  const count = SMALL_COUNTS[totalMeetings] ?? String(totalMeetings)
  const noun = totalMeetings === 1 ? 'game' : 'games'
  return `${count} ${noun}. That's a coin flip, not a rivalry.`
}
