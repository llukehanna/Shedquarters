import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assertLocalDatabase } from '@/lib/db-guard'
import { sql } from '@/lib/db'
import { startSession, logGame, voidLastGame, setTeams, getActiveTable } from '@/lib/session'
import { getRatings, getRatingDeltas } from '@/lib/ratings-cache'
import { getGames } from '@/lib/queries'

// Inserts and deletes real sessions, games and players. Refuse to load at all
// unless the database is local.
assertLocalDatabase()

const PREFIX = 'SpikeTest '
const createdSessionIds: string[] = []

async function makePlayers(n: number): Promise<string[]> {
  const run = randomUUID().slice(0, 8)
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const [row] = await sql`
      insert into players (display_name) values (${`${PREFIX}${run} ${i}`}) returning id
    `
    ids.push(row.id as string)
  }
  return ids
}

async function start(...args: Parameters<typeof startSession>): Promise<string> {
  const id = await startSession(...args)
  createdSessionIds.push(id)
  return id
}

async function gamesOf(sessionId: string) {
  return sql`
    select game_type, target_score, winner, score_a, score_b, voided
    from games where session_id = ${sessionId} order by seq
  `
}

async function sessionTarget(sessionId: string): Promise<number> {
  const [row] = await sql`select target_score from sessions where id = ${sessionId}`
  return row.target_score as number
}

afterAll(async () => {
  // Every session this file started, ended or not, so no stray "active
  // table" is left for another test file to pick up. Cascades to games.
  if (createdSessionIds.length > 0) {
    await sql`delete from sessions where id = any(${createdSessionIds}::uuid[])`
  }
  await sql`delete from players where display_name like ${PREFIX + '%'}`
  await sql`delete from ratings_cache_by_sport where game_type = 'spikeball'`
})

describe('starting a spikeball night', () => {
  it('records the sport and the target', async () => {
    const [a, b, c, d] = await makePlayers(4)
    const id = await start([a, b], [c, d], { gameType: 'spikeball', targetScore: 11 })

    const [row] = await sql`select game_type, target_score, team_size from sessions where id = ${id}`
    expect(row).toEqual({ game_type: 'spikeball', target_score: 11, team_size: 2 })
    await sql`update sessions set ended_at = now() where id = ${id}`
  })

  it('refuses 3v3', async () => {
    const [a, b, c, d, e, f] = await makePlayers(6)
    await expect(startSession([a, b, c], [d, e, f], { gameType: 'spikeball', targetScore: 15 })).rejects.toThrow(
      'Spikeball is 2 a side',
    )
  })

  it('refuses a target spikeball is not played to', async () => {
    const [a, b, c, d] = await makePlayers(4)
    await expect(startSession([a, b], [c, d], { gameType: 'spikeball', targetScore: 21 })).rejects.toThrow(
      'invalid target score for this game',
    )
  })

  it('refuses an unknown game type', async () => {
    const [a, b, c, d] = await makePlayers(4)
    // Cast: a hand-made server action call can send anything.
    await expect(startSession([a, b], [c, d], { gameType: 'croquet' as never })).rejects.toThrow(
      'unknown game type',
    )
  })

  it('still starts a beer die night to 21 when nothing is said', async () => {
    const [a, b, c, d, e, f] = await makePlayers(6)
    const id = await start([a, b, c], [d, e, f])
    const [row] = await sql`select game_type, target_score from sessions where id = ${id}`
    expect(row).toEqual({ game_type: 'beer_die', target_score: 21 })
    await sql`update sessions set ended_at = now() where id = ${id}`
  })
})

describe('a spikeball night', () => {
  it('logs games to each target, undoes, and keeps its ratings apart from beer die', async () => {
    const [a, b, c, d, e, f] = await makePlayers(6)
    const id = await start([a, b], [c, d], { gameType: 'spikeball', targetScore: 15 })

    // getActiveTable() reads the newest open night, and other DB test files
    // run in parallel: date this one ahead so it is the newest regardless.
    await sql`update sessions set started_at = now() + interval '1 day' where id = ${id}`
    const table = await getActiveTable()
    expect(table).toMatchObject({ sessionId: id, gameType: 'spikeball', targetScore: 15 })

    // To 11, holders win 11–4. The night's target follows the game.
    await logGame({
      clientId: randomUUID(),
      sessionId: id,
      winner: 'holders',
      loserScore: 4,
      nextChallengers: [e, f],
      targetScore: 11,
    })
    expect(await sessionTarget(id)).toBe(11)

    // To 25 and past it: challengers win 27–25.
    await logGame({
      clientId: randomUUID(),
      sessionId: id,
      winner: 'challengers',
      loserScore: 25,
      nextChallengers: [c, d],
      targetScore: 25,
    })

    // An older phone's queued game, no target: played to whatever the night is on.
    await logGame({
      clientId: randomUUID(),
      sessionId: id,
      winner: 'holders',
      loserScore: 9,
      nextChallengers: [a, b],
    })

    expect(await gamesOf(id)).toEqual([
      { game_type: 'spikeball', target_score: 11, winner: 'a', score_a: 11, score_b: 4, voided: false },
      { game_type: 'spikeball', target_score: 25, winner: 'b', score_a: 25, score_b: 27, voided: false },
      { game_type: 'spikeball', target_score: 25, winner: 'a', score_a: 25, score_b: 9, voided: false },
    ])

    // Only spikeball's ladder has these players on it.
    const spike = await getRatings('spikeball')
    const beer = await getRatings('beer_die')
    for (const p of [a, b, c, d, e, f]) {
      expect(spike.some((r) => r.playerId === p)).toBe(true)
      expect(beer.some((r) => r.playerId === p)).toBe(false)
    }
    const spikeGames = await getGames('spikeball')
    const beerGames = await getGames('beer_die')
    // a played games 1 and 2, then lost the net. e played 2 and 3.
    expect(spikeGames.filter((g) => [...g.teamA, ...g.teamB].includes(a))).toHaveLength(2)
    expect(spike.find((r) => r.playerId === e)!.games).toBe(2)
    expect(beerGames.some((g) => [...g.teamA, ...g.teamB].includes(a))).toBe(false)
    expect((await getRatingDeltas('spikeball')).size).toBeGreaterThanOrEqual(3)

    // Undo puts the target back to what the undone game was played to.
    await sql`update sessions set target_score = 11 where id = ${id}`
    await voidLastGame(id)
    expect(await sessionTarget(id)).toBe(25)
    expect((await gamesOf(id)).map((g) => g.voided)).toEqual([false, false, true])

    // A void invalidates the spikeball cache like any other.
    const after = await getRatings('spikeball')
    expect(after.find((r) => r.playerId === e)!.games).toBe(1)

    await sql`update sessions set ended_at = now() where id = ${id}`
  })

  it('rejects a target from the wrong sport and writes nothing', async () => {
    const [a, b, c, d] = await makePlayers(4)
    const id = await start([a, b], [c, d], { gameType: 'spikeball', targetScore: 15 })

    await expect(
      logGame({
        clientId: randomUUID(),
        sessionId: id,
        winner: 'holders',
        loserScore: 3,
        nextChallengers: [c, d],
        targetScore: 21,
      }),
    ).rejects.toThrow('invalid target score for this game')
    expect(await gamesOf(id)).toEqual([])
    expect(await sessionTarget(id)).toBe(15)

    await sql`update sessions set ended_at = now() where id = ${id}`
  })

  it('refuses to change a spikeball night to 3v3', async () => {
    const [a, b, c, d, e, f] = await makePlayers(6)
    const id = await start([a, b], [c, d], { gameType: 'spikeball', targetScore: 15 })

    await expect(setTeams(id, [a, b, e], [c, d, f], 3)).rejects.toThrow('Spikeball is 2 a side')
    await setTeams(id, [a, e], [c, f], 2)
    const [row] = await sql`select holders, challengers from sessions where id = ${id}`
    expect(row).toEqual({ holders: [a, e], challengers: [c, f] })

    await sql`update sessions set ended_at = now() where id = ${id}`
  })

  it('rejects a spikeball target on a beer die night', async () => {
    const [a, b, c, d, e, f] = await makePlayers(6)
    const id = await start([a, b, c], [d, e, f])

    await expect(
      logGame({
        clientId: randomUUID(),
        sessionId: id,
        winner: 'holders',
        loserScore: 3,
        nextChallengers: [d, e, f],
        targetScore: 11,
      }),
    ).rejects.toThrow('invalid target score for this game')

    await logGame({
      clientId: randomUUID(),
      sessionId: id,
      winner: 'holders',
      loserScore: 3,
      nextChallengers: [d, e, f],
      targetScore: 21,
    })
    expect(await gamesOf(id)).toEqual([
      { game_type: 'beer_die', target_score: 21, winner: 'a', score_a: 21, score_b: 3, voided: false },
    ])

    await sql`update sessions set ended_at = now() where id = ${id}`
  })
})
