import { sql } from '../lib/db'
import { assertLocalDatabase } from '../lib/db-guard'
import { startSession, logGame, voidLastGame, endSession, getActiveTable } from '../lib/session'

// This script deletes the session it creates, which cascades to games. Refuse
// to run against anything but a local database — see lib/db-guard.ts.
assertLocalDatabase()

// Wrapped in an async IIFE (rather than top-level await) because this
// project has no "type": "module" in package.json, so tsx compiles
// standalone .ts scripts as CommonJS — same reason scripts/migrate.ts
// does the same. No behavioral difference from the brief's version.
;(async () => {
  const names = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']
  let sessionId: string | undefined

  try {
    for (const n of names) {
      await sql`insert into players (display_name) values (${n}) on conflict do nothing`
    }
    const rows = await sql`
      select id from players where display_name = any(${names}) order by display_name
    `
    const ids = rows.map((r) => r.id as string)
    const holders = ids.slice(0, 3)
    const challengers = ids.slice(3, 6)
    const bench = ids.slice(6, 9)

    sessionId = await startSession(holders, challengers)

    const cid = () => crypto.randomUUID()

    await logGame({ clientId: cid(), sessionId, winner: 'holders', loserScore: 12, nextChallengers: bench })
    console.log('after holder win  — run should be 1:', (await getActiveTable())!.runLength)

    await logGame({ clientId: cid(), sessionId, winner: 'holders', loserScore: 8, nextChallengers: challengers })
    console.log('after holder win  — run should be 2:', (await getActiveTable())!.runLength)

    const replay = cid()
    await logGame({ clientId: replay, sessionId, winner: 'challengers', loserScore: 19, nextChallengers: bench })
    await logGame({ clientId: replay, sessionId, winner: 'challengers', loserScore: 19, nextChallengers: bench })
    console.log('replayed write ignored — run should be 1:', (await getActiveTable())!.runLength)
    const swapped = (await getActiveTable())!
    console.log('holders swapped   — should be true:', swapped.holders.join() === challengers.join())

    await voidLastGame(sessionId)
    console.log('after undo        — run should be 2:', (await getActiveTable())!.runLength)

    // --- Finding 1 regression: a rejected write must not partially commit,
    // and a retry with the same clientId (the offline-queue retry path)
    // must then succeed in full. Table is back to holders/challengers here.
    const badClientId = cid()
    const beforeBad = (await getActiveTable())!
    let threw = false
    try {
      await logGame({
        clientId: badClientId,
        sessionId,
        winner: 'holders',
        loserScore: 15,
        // holders[0] is on the winning roster — invalid nextChallengers.
        nextChallengers: [holders[0], bench[0], bench[1]],
      })
    } catch {
      threw = true
    }
    const [{ count: badGameCount }] = await sql`
      select count(*)::int as count from games where client_id = ${badClientId}
    `
    const afterBad = (await getActiveTable())!
    const tableUntouched =
      afterBad.holders.join() === beforeBad.holders.join() &&
      afterBad.challengers.join() === beforeBad.challengers.join() &&
      afterBad.runLength === beforeBad.runLength

    console.log('rejected write threw            — should be true:', threw)
    console.log('rejected write wrote no game    — should be 0:', badGameCount)
    console.log('rejected write left table alone — should be true:', tableUntouched)

    await logGame({ clientId: badClientId, sessionId, winner: 'holders', loserScore: 15, nextChallengers: bench })
    const afterRetry = (await getActiveTable())!
    console.log('corrected retry applied         — run should be 3:', afterRetry.runLength)

    await endSession(sessionId)
    console.log('session ended     — should be null:', await getActiveTable())

    // --- Finding 4 regression: logGame must reject writes to an ended session.
    let endedRejectedCorrectly = false
    try {
      await logGame({ clientId: cid(), sessionId, winner: 'holders', loserScore: 10, nextChallengers: bench })
    } catch (err) {
      endedRejectedCorrectly = (err as Error).message === 'session has ended'
    }
    console.log('ended session rejected           — should be true:', endedRejectedCorrectly)
  } finally {
    // Leave the database clean for re-runs and later tasks.
    if (sessionId) await sql`delete from sessions where id = ${sessionId}` // games cascade
    await sql`delete from players where display_name = any(${names})`
    await sql.end()
  }
})()
