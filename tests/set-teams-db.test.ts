import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { assertLocalDatabase } from '@/lib/db-guard'
import { sql } from '@/lib/db'
import { setTeams } from '@/lib/session'

// This file inserts and updates real session/game rows. Refuse to load at
// all unless the database is local.
assertLocalDatabase()

const createdSessionIds: string[] = []

async function makePlayer(name: string): Promise<string> {
  const [row] = await sql`
    insert into players (display_name) values (${name})
    on conflict (display_name) do update set display_name = excluded.display_name
    returning id
  `
  return row.id as string
}

async function makeSession(
  holders: string[],
  challengers: string[],
  teamSize: number,
  endedAt: Date | null = null,
): Promise<string> {
  const [row] = await sql`
    insert into sessions (holders, challengers, team_size, ended_at)
    values (${holders}::uuid[], ${challengers}::uuid[], ${teamSize}, ${endedAt})
    returning id
  `
  const id = row.id as string
  createdSessionIds.push(id)
  return id
}

async function sessionRow(id: string) {
  const [row] = await sql`select holders, challengers, team_size from sessions where id = ${id}`
  return row as { holders: string[]; challengers: string[]; team_size: number }
}

// One open night per sport is a database rule, so each test's night is closed
// once the test is done with it rather than all of them at the end.
afterEach(async () => {
  if (createdSessionIds.length > 0) {
    await sql`update sessions set ended_at = now() where id = any(${createdSessionIds}::uuid[]) and ended_at is null`
  }
})

afterAll(async () => {
  if (createdSessionIds.length > 0) {
    // Cascades to any games rows inserted against these sessions.
    await sql`delete from sessions where id = any(${createdSessionIds}::uuid[])`
  }
  await sql`delete from players where display_name like 'SetTeamsTest %'`
})

describe('setTeams', () => {
  it('overwrites holders, challengers, and team_size on an active session', async () => {
    const [h1, h2, h3, c1, c2, c3] = await Promise.all(
      ['SetTeamsTest H1', 'SetTeamsTest H2', 'SetTeamsTest H3', 'SetTeamsTest C1', 'SetTeamsTest C2', 'SetTeamsTest C3'].map(
        makePlayer,
      ),
    )
    const sessionId = await makeSession([h1, h2, h3], [c1, c2, c3], 3)

    const [p1, p2, p3, p4] = await Promise.all(
      ['SetTeamsTest P1', 'SetTeamsTest P2', 'SetTeamsTest P3', 'SetTeamsTest P4'].map(makePlayer),
    )

    await setTeams(sessionId, [p1, p2], [p3, p4], 2)

    const row = await sessionRow(sessionId)
    expect(row.holders).toEqual([p1, p2])
    expect(row.challengers).toEqual([p3, p4])
    expect(row.team_size).toBe(2)
  })

  it('rejects a wrong team size and changes nothing', async () => {
    const [h1, h2, h3, c1, c2, c3] = await Promise.all(
      [
        'SetTeamsTest WrongSize H1',
        'SetTeamsTest WrongSize H2',
        'SetTeamsTest WrongSize H3',
        'SetTeamsTest WrongSize C1',
        'SetTeamsTest WrongSize C2',
        'SetTeamsTest WrongSize C3',
      ].map(makePlayer),
    )
    const sessionId = await makeSession([h1, h2, h3], [c1, c2, c3], 3)

    // Only two holders offered for a team size of 3.
    await expect(setTeams(sessionId, [h1, h2], [c1, c2, c3], 3)).rejects.toThrow(
      'holders must have exactly 3 players',
    )

    const row = await sessionRow(sessionId)
    expect(row.holders).toEqual([h1, h2, h3])
    expect(row.challengers).toEqual([c1, c2, c3])
    expect(row.team_size).toBe(3)
  })

  it('rejects an invalid teamSize argument even when the arrays agree with it', async () => {
    const [h1, h2, c1, c2] = await Promise.all(
      ['SetTeamsTest BadSize H1', 'SetTeamsTest BadSize H2', 'SetTeamsTest BadSize C1', 'SetTeamsTest BadSize C2'].map(
        makePlayer,
      ),
    )
    const sessionId = await makeSession([h1, h2], [c1, c2], 2)

    const fiveAside = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makePlayer(`SetTeamsTest BadSize P${i}`)),
    )
    // The `2 | 3` type is compile-time only; call through with a value it
    // can't express (as an unvalidated caller would) to prove the runtime
    // check catches what TypeScript can't.
    await expect(
      setTeams(sessionId, fiveAside.slice(0, 5), fiveAside.slice(5, 10), 5 as unknown as 2 | 3),
    ).rejects.toThrow('team size must be 2 or 3')

    const row = await sessionRow(sessionId)
    expect(row.holders).toEqual([h1, h2])
    expect(row.challengers).toEqual([c1, c2])
    expect(row.team_size).toBe(2)
  })

  it('rejects a duplicate player across the two teams and changes nothing', async () => {
    const [h1, h2, c1, c2] = await Promise.all(
      ['SetTeamsTest Dup H1', 'SetTeamsTest Dup H2', 'SetTeamsTest Dup C1', 'SetTeamsTest Dup C2'].map(makePlayer),
    )
    const sessionId = await makeSession([h1, h2], [c1, c2], 2)

    // h1 appears on both teams.
    await expect(setTeams(sessionId, [h1, h2], [h1, c2], 2)).rejects.toThrow('a player cannot be on both teams')

    const row = await sessionRow(sessionId)
    expect(row.holders).toEqual([h1, h2])
    expect(row.challengers).toEqual([c1, c2])
  })

  it('rejects an unknown player id and changes nothing', async () => {
    const [h1, h2, c1, c2] = await Promise.all(
      ['SetTeamsTest Unknown H1', 'SetTeamsTest Unknown H2', 'SetTeamsTest Unknown C1', 'SetTeamsTest Unknown C2'].map(
        makePlayer,
      ),
    )
    const sessionId = await makeSession([h1, h2], [c1, c2], 2)
    const nobody = '00000000-0000-4000-8000-000000000000'

    await expect(setTeams(sessionId, [h1, nobody], [c1, c2], 2)).rejects.toThrow('unknown player id')

    const row = await sessionRow(sessionId)
    expect(row.holders).toEqual([h1, h2])
    expect(row.challengers).toEqual([c1, c2])
  })

  it('rejects an ended session', async () => {
    const [h1, h2, c1, c2] = await Promise.all(
      ['SetTeamsTest Ended H1', 'SetTeamsTest Ended H2', 'SetTeamsTest Ended C1', 'SetTeamsTest Ended C2'].map(
        makePlayer,
      ),
    )
    const sessionId = await makeSession([h1, h2], [c1, c2], 2, new Date())

    const [p1, p2] = await Promise.all(['SetTeamsTest Ended P1', 'SetTeamsTest Ended P2'].map(makePlayer))
    await expect(setTeams(sessionId, [p1, p2], [c1, c2], 2)).rejects.toThrow('session has ended')

    const row = await sessionRow(sessionId)
    expect(row.holders).toEqual([h1, h2])
    expect(row.challengers).toEqual([c1, c2])
  })

  it('leaves existing games rows untouched', async () => {
    const [h1, h2, c1, c2] = await Promise.all(
      ['SetTeamsTest Games H1', 'SetTeamsTest Games H2', 'SetTeamsTest Games C1', 'SetTeamsTest Games C2'].map(
        makePlayer,
      ),
    )
    const sessionId = await makeSession([h1, h2], [c1, c2], 2)

    await sql`
      insert into games (session_id, seq, team_a, team_b, winner, score_a, score_b, client_id)
      values (${sessionId}, 1, ${[h1, h2]}::uuid[], ${[c1, c2]}::uuid[], 'a', 21, 10, gen_random_uuid())
    `

    const [p1, p2] = await Promise.all(['SetTeamsTest Games P1', 'SetTeamsTest Games P2'].map(makePlayer))
    await setTeams(sessionId, [p1, p2], [c1, c2], 2)

    const [game] = await sql`select team_a, team_b, winner, score_a, score_b from games where session_id = ${sessionId}`
    expect(game.team_a).toEqual([h1, h2])
    expect(game.team_b).toEqual([c1, c2])
    expect(game.winner).toBe('a')
    expect(game.score_a).toBe(21)
    expect(game.score_b).toBe(10)
  })
})
