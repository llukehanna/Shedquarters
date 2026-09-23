import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { assertLocalDatabase } from '@/lib/db-guard'
import { sql } from '@/lib/db'
import { GATE_LOCK_KEY, attemptGate, hashIp } from '@/lib/gate'

// This file hard-deletes every auth_attempts row. Refuse to load at all
// unless the database is local.
assertLocalDatabase()

const SECRET = 'gate-db-test-secret'

beforeEach(async () => {
  // attemptGate reads both at call time.
  process.env.HOUSE_PASSCODE = '4821'
  process.env.AUTH_SECRET = SECRET
  await sql`delete from auth_attempts`
})

afterAll(async () => {
  await sql`delete from auth_attempts`
})

describe('attemptGate against the local database', () => {
  it('accepts the right PIN and records it without storing the raw IP', async () => {
    expect(await attemptGate('4821', '10.0.0.1')).toBe('ok')
    const rows = await sql`select ip_hash, success from auth_attempts`
    expect(rows).toHaveLength(1)
    expect(rows[0].success).toBe(true)
    expect(rows[0].ip_hash).not.toContain('10.0.0.1')
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('locks an IP after 5 failures — even the right PIN is refused', async () => {
    for (let i = 0; i < 5; i++) expect(await attemptGate('0000', '10.0.0.2')).toBe('wrong')
    expect(await attemptGate('4821', '10.0.0.2')).toBe('locked-ip')
    // A different device is unaffected.
    expect(await attemptGate('4821', '10.0.0.3')).toBe('ok')
  })

  it('successful logins do not count toward limits', async () => {
    for (let i = 0; i < 10; i++) expect(await attemptGate('4821', '10.0.0.4')).toBe('ok')
    expect(await attemptGate('0000', '10.0.0.4')).toBe('wrong')
  })

  it('locks globally after 20 failures across rotating IPs', async () => {
    for (let i = 0; i < 20; i++) expect(await attemptGate('0000', `10.1.${i}.1`)).toBe('wrong')
    expect(await attemptGate('4821', '10.9.9.9')).toBe('locked-global')
  })

  it('holds the global limit exactly under concurrent guesses', async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => attemptGate(String(1000 + i), `10.2.${i}.1`)),
    )
    expect(results.filter((r) => r === 'wrong')).toHaveLength(20)
    expect(results.filter((r) => r === 'locked-global')).toHaveLength(20)
    const [{ n }] = await sql`select count(*)::int as n from auth_attempts where success = false`
    expect(n).toBe(20)
  })

  it('ignores failures outside the windows and prunes rows older than 7 days', async () => {
    await sql`
      insert into auth_attempts (ip_hash, success, created_at)
      select 'old', false, now() - interval '25 hours' from generate_series(1, 30)
    `
    await sql`insert into auth_attempts (ip_hash, success, created_at) values ('ancient', false, now() - interval '8 days')`
    expect(await attemptGate('4821', '10.0.0.5')).toBe('ok')
    const [{ n }] = await sql`select count(*)::int as n from auth_attempts where ip_hash = 'ancient'`
    expect(n).toBe(0)
  })

  it('ignores per-IP failures older than 15 minutes', async () => {
    const ipHash = hashIp('10.0.0.6', SECRET)
    await sql`
      insert into auth_attempts (ip_hash, success, created_at)
      select ${ipHash}, false, now() - interval '16 minutes' from generate_series(1, 5)
    `
    expect(await attemptGate('0000', '10.0.0.6')).toBe('wrong')
  })

  it(
    'fails closed ("busy") when the advisory lock times out, recording nothing',
    async () => {
      // Hold the same advisory lock attemptGate needs, from a separate
      // connection, so attemptGate's own lock wait times out (lock_timeout
      // is 5s — see lib/gate.ts) instead of ever reaching the PIN compare.
      let lockAcquired: () => void
      const lockAcquiredPromise = new Promise<void>((resolve) => {
        lockAcquired = resolve
      })
      let releaseLock: () => void
      const holder = sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(${GATE_LOCK_KEY})`
        lockAcquired()
        await new Promise<void>((resolve) => {
          releaseLock = resolve
        })
      })
      await lockAcquiredPromise

      try {
        expect(await attemptGate('4821', '10.0.0.9')).toBe('busy')
      } finally {
        releaseLock!()
        await holder
      }

      // A timed-out lock wait must not have recorded a guess.
      const [{ n }] = await sql`select count(*)::int as n from auth_attempts`
      expect(n).toBe(0)
    },
    10_000,
  )

  it('fails closed without AUTH_SECRET or HOUSE_PASSCODE, doing no database work', async () => {
    delete process.env.AUTH_SECRET
    expect(await attemptGate('4821', '10.0.0.7')).toBe('misconfigured')
    process.env.AUTH_SECRET = SECRET
    process.env.HOUSE_PASSCODE = ''
    expect(await attemptGate('', '10.0.0.7')).toBe('misconfigured')
    const [{ n }] = await sql`select count(*)::int as n from auth_attempts`
    expect(n).toBe(0)
  })
})
