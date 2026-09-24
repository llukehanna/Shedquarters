import { sql } from '@/lib/db'
import { winnerScore, isValidLoserScore } from '@/lib/domain/score'
import { DEFAULT_SPORT, SPORTS, SPORT_RULES, isSport, isValidTarget, isValidTeamSize, type Sport } from '@/lib/domain/sport'
import type { LogGameInput } from '@/lib/types'

export type TableState = {
  sessionId: string
  holders: string[]
  challengers: string[]
  seq: number
  runLength: number
  /** Which ladder tonight's games count toward. Fixed for the whole night. */
  gameType: Sport
  /** What the last game was played to, or what the night started on. The next game's default. */
  targetScore: number
}

/**
 * This sport's open night, if there is one. A beer die night and a spikeball
 * night can run at the same time (`sessions_one_open_per_sport` allows one of
 * each), so the sport has to be asked for.
 */
export async function getActiveTable(sport: Sport): Promise<TableState | null> {
  const [s] = await sql`
    select id, holders, challengers, game_type, target_score from sessions
    where ended_at is null and game_type = ${sport}
    order by started_at desc limit 1
  `
  if (!s || !s.holders || !s.challengers) return null

  const games = await sql`
    select seq, team_a, team_b, winner from games
    where session_id = ${s.id} and voided = false
    order by seq desc
  `

  // A run is the streak of consecutive games (most recent first) won by
  // whichever roster currently holds the table. team_a is always who held
  // *going into* that game, so a challenger who just won was team_b in
  // that very row — the run must key off the actual winning roster, not
  // assume the holder was always team_a.
  let runLength = 0
  for (const g of games) {
    const winningRoster = g.winner === 'a' ? (g.team_a as string[]) : (g.team_b as string[])
    if (sameRoster(winningRoster, s.holders as string[])) runLength++
    else break
  }

  return {
    sessionId: s.id as string,
    holders: s.holders as string[],
    challengers: s.challengers as string[],
    seq: games.length > 0 ? (games[0].seq as number) : 0,
    runLength,
    gameType: isSport(s.game_type) ? s.game_type : DEFAULT_SPORT,
    targetScore: s.target_score as number,
  }
}

/** The sports with a night going right now, in `SPORTS` order. */
export async function getLiveSports(): Promise<Sport[]> {
  const rows = await sql`select distinct game_type from sessions where ended_at is null`
  const live = new Set(rows.map((r) => r.game_type as string))
  return SPORTS.filter((s) => live.has(s))
}

function sameRoster(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join()
}

export type StartOptions = { gameType?: Sport; targetScore?: number }

export async function startSession(
  holders: string[],
  challengers: string[],
  opts: StartOptions = {},
): Promise<string> {
  // Checked at runtime, not just typed: this arrives through a server action,
  // where the type has already been erased.
  const gameType = opts.gameType ?? DEFAULT_SPORT
  if (!isSport(gameType)) throw new Error('unknown game type')
  const targetScore = opts.targetScore ?? SPORT_RULES[gameType].defaultTarget
  if (!isValidTarget(gameType, targetScore)) throw new Error('invalid target score for this game')
  // Beer die has never checked this here, and a size mismatch is still
  // caught nowhere else for it. Spikeball is always 2v2, so it is enforced.
  if (gameType !== DEFAULT_SPORT) {
    if (!isValidTeamSize(gameType, holders.length) || challengers.length !== holders.length) {
      throw new Error(`${SPORT_RULES[gameType].name} is ${SPORT_RULES[gameType].teamSizes.join(' or ')} a side`)
    }
  }

  assertDistinct(holders, challengers)
  const teamSize = holders.length
  try {
    const [row] = await sql`
      insert into sessions (holders, challengers, team_size, game_type, target_score)
      values (${holders}::uuid[], ${challengers}::uuid[], ${teamSize}, ${gameType}, ${targetScore})
      returning id
    `
    return row.id as string
  } catch (e) {
    // Someone else started this sport's night first (two phones, one table).
    if (isUniqueViolation(e, 'sessions_one_open_per_sport')) {
      throw new Error(`${SPORT_RULES[gameType].name} night already running`)
    }
    throw e
  }
}

export async function logGame(input: LogGameInput): Promise<void> {
  const { clientId, sessionId, winner, loserScore, nextChallengers, targetScore } = input
  if (!isValidLoserScore(loserScore)) throw new Error(`invalid losing score: ${loserScore}`)

  // Idempotency: a retried write must not create a second game.
  const [seen] = await sql`select 1 from games where client_id = ${clientId}`
  if (seen) return

  // Only an active session has table state to read or update.
  const [s] = await sql`
    select holders, challengers, game_type, target_score from sessions
    where id = ${sessionId} and ended_at is null
  `
  if (!s) {
    const [exists] = await sql`select 1 from sessions where id = ${sessionId}`
    throw new Error(exists ? 'session has ended' : 'session not found')
  }
  if (!s.holders || !s.challengers) throw new Error('session has no table state')

  const holders = s.holders as string[]
  const challengers = s.challengers as string[]
  const gameType: Sport = isSport(s.game_type) ? s.game_type : DEFAULT_SPORT
  // A game says what it was played to. One queued by an older build doesn't,
  // and gets the night's current target, which is the only one it could
  // have meant back when beer die was the only game.
  const target = targetScore ?? (s.target_score as number)
  if (!isValidTarget(gameType, target)) throw new Error('invalid target score for this game')
  const holdersWon = winner === 'holders'
  const win = winnerScore(loserScore, target)
  const newHolders = holdersWon ? holders : challengers

  // Validate before any write. If this throws, neither the game row nor the
  // session's table state may have changed — a retry with the same clientId
  // (as the offline queue does) must land on a clean, unmodified state.
  assertDistinct(newHolders, nextChallengers)

  // The insert and the table-state update commit together or not at all, so
  // a crash or a later validation failure can never leave the games table
  // and the session's holders/challengers out of sync.
  await sql.begin(async (tx) => {
    const [{ next }] = await tx`
      select coalesce(max(seq), 0) + 1 as next from games where session_id = ${sessionId}
    `

    // team_a is always the holding team, so replay order and table order agree.
    await tx`
      insert into games (
        session_id, seq, team_a, team_b, winner, score_a, score_b, client_id, game_type, target_score
      )
      values (
        ${sessionId}, ${next},
        ${holders}::uuid[], ${challengers}::uuid[],
        ${holdersWon ? 'a' : 'b'},
        ${holdersWon ? win : loserScore},
        ${holdersWon ? loserScore : win},
        ${clientId},
        ${gameType}, ${target}
      )
      on conflict (client_id) do nothing
    `

    // The target sticks: the next game defaults to whatever this one was
    // played to, on every phone, not just the one that logged it.
    await tx`
      update sessions
      set holders = ${newHolders}::uuid[], challengers = ${nextChallengers}::uuid[],
          target_score = ${target}
      where id = ${sessionId}
    `
  })
}

/**
 * Overwrites the current lineup on an active session — used to swap players
 * mid-night without ending it. Mirrors `logGame`'s validation style since the
 * caller (a server action) surfaces these messages verbatim.
 *
 * `games` rows are never touched here: history keeps the teams it was played
 * with, so past ratings and the run displayed on the table are unaffected by
 * a lineup change. Only the session's current-table pointer moves.
 *
 * Reached only through the `setTeams` server action in lib/actions.ts, never
 * through app/api/games/route.ts. That route's `CLIENT_FAULT_MESSAGES`
 * allowlist is queue-terminal and scoped to what `logGame` can throw — the
 * offline queue is the only thing that reads it, to decide what to
 * dead-letter. This function's error messages deliberately do not belong
 * there; a server action's thrown errors reach the client with their message
 * intact on their own, with no status-code mapping involved.
 */
export async function setTeams(
  sessionId: string,
  holders: string[],
  challengers: string[],
  teamSize: 2 | 3,
): Promise<void> {
  // Only an active session has table state to overwrite — the same rule
  // logGame enforces, and for the same reason: an ended night's table is not
  // there to be edited.
  const [s] = await sql`
    select id, game_type from sessions where id = ${sessionId} and ended_at is null
  `
  if (!s) {
    const [exists] = await sql`select 1 from sessions where id = ${sessionId}`
    throw new Error(exists ? 'session has ended' : 'session not found')
  }

  // The `2 | 3` type is compile-time only — it erases at the server-action
  // boundary, so a hand-made call (or a future caller that isn't the
  // TeamSizeToggle) could pass any number here. The house only plays 2v2 or
  // 3v3; a team_size the toggle can't represent would silently corrupt what
  // every other screen assumes about this session.
  if (teamSize !== 2 && teamSize !== 3) throw new Error('team size must be 2 or 3')
  // Spikeball is 2v2 and nothing else; a 3v3 night of it can't be written.
  const gameType: Sport = isSport(s.game_type) ? s.game_type : DEFAULT_SPORT
  if (!isValidTeamSize(gameType, teamSize)) {
    throw new Error(`${SPORT_RULES[gameType].name} is ${SPORT_RULES[gameType].teamSizes.join(' or ')} a side`)
  }

  if (holders.length !== teamSize) throw new Error(`holders must have exactly ${teamSize} players`)
  if (challengers.length !== teamSize) throw new Error(`challengers must have exactly ${teamSize} players`)

  assertDistinct(holders, challengers)

  const ids = [...holders, ...challengers]
  const rows = await sql`select id from players where id = any(${ids}::uuid[])`
  if (rows.length !== ids.length) throw new Error('unknown player id')

  await sql`
    update sessions
    set holders = ${holders}::uuid[], challengers = ${challengers}::uuid[], team_size = ${teamSize}
    where id = ${sessionId}
  `
}

export async function voidLastGame(sessionId: string): Promise<void> {
  const [g] = await sql`
    select id, team_a, team_b, target_score from games
    where session_id = ${sessionId} and voided = false
    order by seq desc limit 1
  `
  if (!g) return

  // Same invariant as logGame four lines up, in the opposite direction: the
  // void and the table restore commit together or not at all. If only the
  // void landed, the session would still name the post-game holders, and the
  // next logGame would write team_a = the wrong roster — corrupting exactly
  // the column this function and longestRuns() both read back.
  await sql.begin(async (tx) => {
    await tx`update games set voided = true where id = ${g.id}`

    // Restore the table to what it was immediately before that game, and the
    // target to the one it was played to, so re-entering it starts there.
    await tx`
      update sessions
      set holders = ${g.team_a}::uuid[], challengers = ${g.team_b}::uuid[],
          target_score = ${g.target_score}
      where id = ${sessionId}
    `
  })
}

export async function endSession(sessionId: string): Promise<void> {
  await sql`update sessions set ended_at = now() where id = ${sessionId}`
}

function assertDistinct(a: string[], b: string[]): void {
  const overlap = a.filter((id) => b.includes(id))
  if (overlap.length > 0) throw new Error('a player cannot be on both teams')
  if (new Set(a).size !== a.length || new Set(b).size !== b.length) {
    throw new Error('duplicate player on a team')
  }
}

/** Returns true if a new player was inserted, false if the name already existed. */
export async function addPlayer(name: string, isHousemate: boolean): Promise<boolean> {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('name is required')
  const rows = await sql`
    insert into players (display_name, is_housemate)
    values (${trimmed}, ${isHousemate})
    on conflict (display_name) do nothing
    returning id
  `
  return rows.length > 0
}

const MAX_FIELD_LENGTH = 40

/** Postgres SQLSTATE for "unique_violation" (see `errcodes.txt`). */
const UNIQUE_VIOLATION = '23505'

/** A unique-constraint hit, optionally on one named constraint (index) only. */
function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err) || err.code !== UNIQUE_VIOLATION) return false
  return constraint === undefined || ('constraint_name' in err && err.constraint_name === constraint)
}

/**
 * Renames a player. Trims, then throws on an empty name or one over 40
 * characters. `update` has no `on conflict` clause — unlike an insert, a
 * unique-constraint hit surfaces as a thrown error — so a collision with
 * some *other* player's display_name is caught here and reported as false
 * rather than as an exception. Renaming to the name the player already
 * holds is not a collision (a row never conflicts with itself), so it
 * succeeds like any other rename.
 */
export async function renamePlayer(id: string, name: string): Promise<boolean> {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('name is required')
  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new Error(`name must be ${MAX_FIELD_LENGTH} characters or fewer`)
  }
  try {
    await sql`update players set display_name = ${trimmed} where id = ${id}`
    return true
  } catch (err) {
    if (isUniqueViolation(err)) return false
    throw err
  }
}

const MAX_NICKNAMES = 6

/**
 * Adds a nickname to a player's list. Trims, then throws on an empty
 * nickname or one over 40 characters. Returns false — rather than throwing —
 * for the two outcomes the UI shows inline instead of treating as an error:
 * a duplicate of one this player already has (case-insensitive, so nobody
 * adds "Big Cat" next to "BIG CAT"), and being at the 6-nickname cap already.
 * Nicknames are never unique *across* players or against display names —
 * only within one player's own list.
 */
export async function addNickname(id: string, nickname: string): Promise<boolean> {
  const trimmed = nickname.trim()
  if (trimmed.length === 0) throw new Error('nickname is required')
  // Unlike the cap below, this length check is plain JavaScript, not a SQL
  // condition — fine only because this module is the sole writer of
  // `nicknames`. A second writer would need this re-checked atomically too.
  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new Error(`nickname must be ${MAX_FIELD_LENGTH} characters or fewer`)
  }

  // One atomic conditional update rather than read-then-write: the cap and
  // duplicate checks are re-evaluated by Postgres against the row it is
  // about to write, so two concurrent adds for the same player can't both
  // read "5 nicknames, no duplicate" and both proceed to a 7th or a dupe.
  const rows = await sql`
    update players
    set nicknames = array_append(nicknames, ${trimmed})
    where id = ${id}
      and cardinality(nicknames) < ${MAX_NICKNAMES}
      and not exists (
        select 1 from unnest(nicknames) as existing(n) where lower(existing.n) = lower(${trimmed})
      )
    returning id
  `
  return rows.length > 0
}

/** Removes one nickname by exact match. A no-op if the player doesn't have it. */
export async function removeNickname(id: string, nickname: string): Promise<void> {
  await sql`
    update players set nicknames = array_remove(nicknames, ${nickname})
    where id = ${id}
  `
}
