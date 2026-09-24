import { sql } from '@/lib/db'
import type { GameRecord } from '@/lib/domain/ratings'
import { capGameLog } from '@/lib/domain/game-log'
import type { Sport } from '@/lib/domain/sport'

export type Player = {
  id: string
  displayName: string
  photoUrl: string | null
  isHousemate: boolean
  nicknames: string[]
}

export async function getPlayers(): Promise<Player[]> {
  const rows = await sql`
    select id, display_name, photo_url, is_housemate, nicknames
    from players order by display_name
  `
  return rows.map((r) => ({
    id: r.id as string,
    displayName: r.display_name as string,
    photoUrl: r.photo_url as string | null,
    isHousemate: r.is_housemate as boolean,
    nicknames: (r.nicknames as string[] | null) ?? [],
  }))
}

/** One sport's games, in replay order. Sports never share a ladder, so nothing reads across them. */
export async function getGames(sport: Sport): Promise<GameRecord[]> {
  const rows = await sql`
    select ord, team_a, team_b, winner, score_a, score_b, voided, target_score
    from games where game_type = ${sport} order by ord
  `
  return rows.map((r) => ({
    ord: Number(r.ord),
    teamA: r.team_a as string[],
    teamB: r.team_b as string[],
    winner: r.winner as 'a' | 'b',
    scoreA: r.score_a as number,
    scoreB: r.score_b as number,
    voided: r.voided as boolean,
    targetScore: r.target_score as number,
  }))
}

/** The game log page shows at most this many of the most recent games. */
export const GAME_LOG_LIMIT = 200

export type GameLogEntry = GameRecord & {
  sessionId: string
  /** ISO timestamp. */
  createdAt: string
}

// Row shape for getGameLog(), which needs session_id to group a night's
// games. getGameLogAll() uses the narrower GameHistoryRow.
type GameLogRow = {
  ord: number | string | bigint
  session_id: string
  created_at: Date
  team_a: string[]
  team_b: string[]
  winner: 'a' | 'b'
  score_a: number
  score_b: number
  voided: boolean
  target_score: number
}

function mapGameLogRow(r: GameLogRow): GameLogEntry {
  return {
    ord: Number(r.ord),
    sessionId: r.session_id,
    createdAt: r.created_at.toISOString(),
    teamA: r.team_a,
    teamB: r.team_b,
    winner: r.winner,
    scoreA: r.score_a,
    scoreB: r.score_b,
    voided: r.voided,
    targetScore: r.target_score,
  }
}

/**
 * Same rows as getGames(), plus the session id and timestamp the log needs
 * to group games into nights — capped rather than fetching the unbounded
 * history. getGames() itself is untouched: lib/domain/ratings.ts and
 * lib/domain/stats.ts replay every game and must see the whole table.
 *
 * Fetches one row past `limit` so `truncated` reflects whether there's
 * actually more beyond this page, rather than a house that has logged
 * exactly `limit` games ever tripping a false "older games not shown".
 */
export async function getGameLog(
  sport: Sport,
  limit: number = GAME_LOG_LIMIT,
): Promise<{ games: GameLogEntry[]; truncated: boolean }> {
  const rows = await sql`
    select ord, session_id, created_at, team_a, team_b, winner, score_a, score_b, voided, target_score
    from games where game_type = ${sport} order by ord desc limit ${limit + 1}
  `
  const mapped = rows.map((r) => mapGameLogRow(r as unknown as GameLogRow))
  const { rows: games, truncated } = capGameLog(mapped, limit)
  return { games, truncated }
}

export type GameHistoryEntry = GameRecord & {
  /** ISO timestamp. */
  createdAt: string
}

// Row shape for getGameLogAll() — same columns as GameLogRow minus
// session_id, which nothing consuming the full history needs (there is no
// per-night grouping over the whole table, only over the capped log page).
type GameHistoryRow = Omit<GameLogRow, 'session_id'>

function mapGameHistoryRow(r: GameHistoryRow): GameHistoryEntry {
  return {
    ord: Number(r.ord),
    createdAt: r.created_at.toISOString(),
    teamA: r.team_a,
    teamB: r.team_b,
    winner: r.winner,
    scoreA: r.score_a,
    scoreB: r.score_b,
    voided: r.voided,
    targetScore: r.target_score,
  }
}

/**
 * Every game, with timestamps but without the game-log page's session
 * grouping or its cap — for request-scoped aggregate computations that need
 * the *entire* history: the rankings page's streaks, movement, and shame
 * board. Unlike getGameLog(), there is no limit and therefore nothing to
 * truncate — reusing getGameLog() with an artificially huge limit would
 * misuse a paginated helper and silently discard its `truncated` signal.
 */
export async function getGameLogAll(sport: Sport): Promise<GameHistoryEntry[]> {
  const rows = await sql`
    select ord, created_at, team_a, team_b, winner, score_a, score_b, voided, target_score
    from games where game_type = ${sport} order by ord
  `
  return rows.map((r) => mapGameHistoryRow(r as unknown as GameHistoryRow))
}

/**
 * Changes on any insert or void of this sport's games. Counting voided rows
 * separately is what makes a void invalidate the cache — a void changes
 * neither the row count nor the max ord. Scoped to one sport, every term is
 * still monotonic: a game never changes sport.
 */
export async function getFingerprint(sport: Sport): Promise<string> {
  const [row] = await sql`
    select count(*)::text || ':' ||
           coalesce(max(ord), 0)::text || ':' ||
           count(*) filter (where voided)::text as fp
    from games where game_type = ${sport}
  `
  return row.fp as string
}
