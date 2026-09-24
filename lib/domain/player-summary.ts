import type { PlayerRating, GameRecord } from '@/lib/domain/ratings'
import type { GameHistoryEntry, Player } from '@/lib/queries'
import type { Sport } from '@/lib/domain/sport'
import {
  currentStreakFromLive,
  headToHead,
  liveGames,
  pointDifferentialFromLive,
  type DifferentialRecord,
  type Streak,
} from '@/lib/domain/stats'
import { earnedBadgesFromLive, type Badge } from '@/lib/domain/badges'

/** One sport's line on a player's page. Empty (not missing) for a sport they have never played. */
export type SportSummary = {
  /** Live (non-voided) games they played in this sport. */
  played: number
  /** 1-based place on this sport's ladder, or null if they are not on it. */
  rank: number | null
  rating: PlayerRating | null
  wins: number
  losses: number
  winRate: number | null
  streak: Streak | null
  diff: DifferentialRecord
  badges: Badge[]
}

/**
 * Everything the player page shows for one sport, from that sport's ladder
 * (`ratings`, best first, as `getRatings` returns it) and history. Run once per
 * sport. Sorts the history once and hands it to every per-player helper, the
 * way the rankings page does.
 */
export function playerSportSummary(
  ratings: PlayerRating[],
  games: GameHistoryEntry[],
  playerId: string,
  now: Date,
): SportSummary {
  const live = liveGames(games)
  const played = live.filter((g) => g.teamA.includes(playerId) || g.teamB.includes(playerId)).length
  const index = ratings.findIndex((r) => r.playerId === playerId)
  const rating = index >= 0 ? ratings[index] : null
  const wins = rating?.wins ?? 0
  const losses = rating ? rating.games - rating.wins : 0

  return {
    played,
    rank: rating ? index + 1 : null,
    rating,
    wins,
    losses,
    winRate: rating && rating.games > 0 ? rating.wins / rating.games : null,
    streak: currentStreakFromLive(live, playerId),
    diff: pointDifferentialFromLive(live, playerId),
    // Rookie is earned by having played few games, which zero would qualify
    // for: a sport they have never played gets its empty card and no badges.
    badges: played > 0 ? earnedBadgesFromLive(live, playerId, now) : [],
  }
}

export type WinLoss = { wins: number; losses: number }

export type HeadToHeadRow = {
  player: Player
  /** Null when the two never played against each other in that sport. */
  die: WinLoss | null
  spike: WinLoss | null
}

/**
 * Everyone this player has faced in either sport, with a record for each
 * sport (null where they never met in it). Teammates-only pairings are left
 * out. Most games against each other first, then by name.
 */
export function headToHeadBoth(
  gamesBySport: Record<Sport, GameRecord[]>,
  playerId: string,
  players: Player[],
): HeadToHeadRow[] {
  const met = (r: WinLoss) => (r.wins + r.losses > 0 ? r : null)
  const total = (r: WinLoss | null) => (r ? r.wins + r.losses : 0)

  return players
    .filter((p) => p.id !== playerId)
    .map((p) => ({
      player: p,
      die: met(headToHead(gamesBySport.beer_die, playerId, p.id)),
      spike: met(headToHead(gamesBySport.spikeball, playerId, p.id)),
    }))
    .filter((r) => r.die !== null || r.spike !== null)
    .sort(
      (a, b) =>
        total(b.die) + total(b.spike) - (total(a.die) + total(a.spike)) ||
        a.player.displayName.localeCompare(b.player.displayName),
    )
}
