import { PROVISIONAL_GAMES } from './ratings'
import { TARGET_SCORE, WIN_BY } from './score'
import { SHED_TIME_ZONE } from './game-log'
import { liveGames } from './stats'
// Type-only, so nothing in lib/db is pulled in at runtime and this module
// stays as DB-free as the rest of lib/domain. Reusing the row type rather
// than restating it means a column change can't leave the two out of step.
import type { GameHistoryEntry } from '@/lib/queries'

/**
 * Days without a game before a player is a Ghost. Twenty-one, because that
 * is what the game is played to and because three weeks is long enough that
 * nobody can call it a busy fortnight.
 */
export const GHOST_DAYS = 21

export type BadgeKind = 'skunk' | 'heartbreaker' | 'rookie' | 'ghost'

/**
 * `count` is the number of games that earned the badge, for the badges where
 * repeating it means something ("Skunk ×3" is a brag). Null where a count
 * would be noise: you are a Rookie or you aren't, and a Ghost is defined by
 * the games that didn't happen.
 */
export type Badge = { kind: BadgeKind; count: number | null }

/**
 * The words the reader actually sees. Kept beside the rules that award each
 * badge so the two can't drift, and interpolated from the same constants the
 * rules use so the copy can't quietly claim a different threshold.
 */
export const BADGE_COPY: Record<BadgeKind, { name: string; blurb: string }> = {
  skunk: {
    name: 'Skunk',
    blurb: 'Held a team to nothing. They are still blaming the table.',
  },
  heartbreaker: {
    name: 'Heartbreaker',
    blurb: 'Won one past the target. Somebody is still thinking about it.',
  },
  rookie: {
    name: 'Rookie',
    blurb: `Under ${PROVISIONAL_GAMES} games in. The rating is still guessing.`,
  },
  ghost: {
    name: 'Ghost',
    blurb: `No games in ${GHOST_DAYS} days. The table has moved on.`,
  },
}

/**
 * The calendar day an instant falls on in Shed time, as a whole number of
 * days that can be subtracted from another. Pinning to `SHED_TIME_ZONE`
 * (rather than UTC or the host's zone) is what makes "21 days ago" mean the
 * same thing on a Vercel box in Virginia as it does on a phone at the table,
 * and matches how every other date in the app is rendered.
 */
function shedDayNumber(iso: string): number {
  // en-CA gives ISO-shaped YYYY-MM-DD, so the parts come out in a fixed
  // order without having to pick through formatToParts.
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHED_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(iso))
    .split('-')
    .map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Whole Shed-time days between two instants. Negative if `to` precedes `from`. */
function daysBetweenInShedTime(fromIso: string, toIso: string): number {
  return shedDayNumber(toIso) - shedDayNumber(fromIso)
}

/**
 * Which badges a player has earned, in a fixed order: the two you win at the
 * table first, then the two that describe where you stand.
 *
 * Voided games are not games — they don't award a Skunk, don't count toward
 * the Rookie threshold, and don't keep a Ghost alive. A player with nothing
 * to show gets an empty array; there is no "no badges yet" placeholder here
 * and none rendered.
 */
export function earnedBadges(games: GameHistoryEntry[], playerId: string, now: Date): Badge[] {
  return earnedBadgesFromLive(liveGames(games), playerId, now)
}

/**
 * Same as `earnedBadges`, but takes an already-`liveGames`-sorted list, the
 * same way `pointDifferentialFromLive` and `currentStreakFromLive` do — so a
 * caller that already sorted the history for another stat (the player
 * profile sorts once for the point differential) doesn't pay for a second
 * sort of the whole table.
 */
export function earnedBadgesFromLive(
  liveSorted: GameHistoryEntry[],
  playerId: string,
  now: Date,
): Badge[] {
  let played = 0
  let skunks = 0
  let heartbreakers = 0
  let lastPlayedAt: string | null = null

  for (const g of liveSorted) {
    const side = g.teamA.includes(playerId) ? 'a' : g.teamB.includes(playerId) ? 'b' : null
    if (!side) continue

    played++
    // liveSorted is oldest-first, so the last game seen is the most recent by
    // `ord` — the authoritative order — and its timestamp is the one to
    // measure staleness from. `created_at` is never sorted on.
    lastPlayedAt = g.createdAt

    if (g.winner !== side) continue

    const loserScore = side === 'a' ? g.scoreB : g.scoreA
    const winnerScore = side === 'a' ? g.scoreA : g.scoreB

    if (loserScore === 0) skunks++
    // A deuce win: the game went past the target and ended the moment the
    // winner was exactly WIN_BY clear. Both halves are checked rather than
    // inferred from each other, so a malformed row (say a recorded 30–10)
    // can never masquerade as a heartbreaker.
    // The target is the game's own: 21 for beer die, whatever the spikeball
    // game was played to.
    const target = g.targetScore ?? TARGET_SCORE
    if (winnerScore > target && winnerScore - loserScore === WIN_BY) heartbreakers++
  }

  const badges: Badge[] = []
  if (skunks > 0) badges.push({ kind: 'skunk', count: skunks })
  if (heartbreakers > 0) badges.push({ kind: 'heartbreaker', count: heartbreakers })
  // Deliberately not gated on having played: somebody who has never picked
  // up a die is as rookie as it gets, and shares the provisional line with
  // everybody else short of PROVISIONAL_GAMES.
  if (played < PROVISIONAL_GAMES) badges.push({ kind: 'rookie', count: null })
  // Ghost is the opposite: it describes an absence, and you cannot be absent
  // from something you never showed up to.
  if (lastPlayedAt !== null && daysBetweenInShedTime(lastPlayedAt, now.toISOString()) >= GHOST_DAYS) {
    badges.push({ kind: 'ghost', count: null })
  }

  return badges
}
