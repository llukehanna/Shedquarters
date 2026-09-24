import { describe, it, expect, afterAll } from 'vitest'
import { sql } from '@/lib/db'
import { assembleDump } from '@/lib/backup'
import { assertLocalDatabase } from '@/lib/db-guard'

// This file seeds and then hard-deletes sessions, which cascades to games.
// Run against a production DATABASE_URL it would destroy real, append-only
// game history, so refuse to load at all unless the database is local.
assertLocalDatabase()

// Exercises the dump assembly against the real local database (seeded here),
// since @vercel/blob's put() needs BLOB_READ_WRITE_TOKEN, which doesn't
// exist outside of a linked Vercel project. This is the part of the backup
// route that CAN be verified without a Vercel account.
describe('assembleDump', () => {
  const tag = `backup-test-${crypto.randomUUID()}`
  const names = [`${tag}-a`, `${tag}-b`]
  let playerIds: string[] = []
  let sessionId: string | undefined
  const clientId = crypto.randomUUID()

  afterAll(async () => {
    if (sessionId) await sql`delete from sessions where id = ${sessionId}` // games cascade
    if (playerIds.length) await sql`delete from players where id = any(${playerIds})`
  })

  it('includes every player, session, and game, and excludes ratings_cache', async () => {
    for (const n of names) {
      await sql`insert into players (display_name) values (${n})`
    }
    const rows = await sql`select id from players where display_name = any(${names}) order by display_name`
    playerIds = rows.map((r) => r.id as string)

    const [session] = await sql`
      -- Already ended: an open night would count against the one-open-night-
      -- per-sport rule, and the night tests in spikeball-db.test.ts run in parallel.
      insert into sessions (holders, challengers, ended_at) values (${playerIds}, ${playerIds}, now())
      returning id
    `
    sessionId = session.id as string

    await sql`
      insert into games (session_id, seq, team_a, team_b, winner, score_a, score_b, client_id)
      values (${sessionId}, 1, ${[playerIds[0]]}, ${[playerIds[1]]}, 'a', 21, 10, ${clientId})
    `

    const dump = await assembleDump()

    expect(dump.players.some((p) => (p as { display_name: string }).display_name === names[0])).toBe(true)
    expect(dump.players.some((p) => (p as { display_name: string }).display_name === names[1])).toBe(true)
    expect(dump.sessions.some((s) => (s as { id: string }).id === sessionId)).toBe(true)
    expect(dump.games.some((g) => (g as { client_id: string }).client_id === clientId)).toBe(true)

    // ratings_cache is derived and must never appear in the dump.
    expect(Object.keys(dump)).not.toContain('ratingsCache')
    expect(Object.keys(dump)).not.toContain('ratings_cache')
    expect(JSON.stringify(dump)).not.toContain('ratings_cache')
  })
})
