import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from '@/lib/db'
import {
  ATTEMPT_RETENTION_MS,
  GLOBAL_WINDOW_MS,
  IP_WINDOW_MS,
  decideGateAttempt,
  type GateStatus,
} from '@/lib/domain/gate-limit'

/**
 * Arbitrary constant key for the transaction-scoped advisory lock that
 * serialises gate attempts. Without it the limiter is check-then-act: 100
 * parallel wrong guesses would all read "0 failures" and all be compared.
 * Holding one lock across count → compare → record makes the limit exact.
 * Gate traffic is a handful of logins a night, so global serialisation costs
 * nothing, and pg_advisory_xact_lock is released at commit, so it is safe
 * behind Neon's transaction-mode pooler.
 *
 * Exported only so tests can hold this same lock to exercise the timeout
 * path below; nothing else should depend on its value.
 */
export const GATE_LOCK_KEY = 4_815_162_342

/**
 * A queued gate attempt waits on `pg_advisory_xact_lock` while holding a
 * pooled Neon connection. A flood of parallel guesses would otherwise queue
 * indefinitely, each holding a connection, and crowd out game writes sharing
 * the same pool. `lock_timeout` bounds that wait so a queued request fails
 * fast instead. It is `set local`, so it only applies inside this
 * transaction and never leaks onto a pooled connection reused for something
 * else.
 */
const LOCK_TIMEOUT = '5s'

/** Postgres SQLSTATE for "lock_timeout exceeded" (see `errcodes.txt`). */
const LOCK_NOT_AVAILABLE = '55P03'

function isLockTimeout(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === LOCK_NOT_AVAILABLE
}

/** Never store raw IPs: key the hash so the table alone cannot be reversed. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`auth-attempt-ip\n${ip}`).digest('hex')
}

/**
 * Constant-time PIN comparison that also hides the PIN's length: both sides
 * are hashed to a fixed 32 bytes first, so a length mismatch takes the same
 * path as a wrong digit.
 */
function pinMatches(submitted: string, expected: string): boolean {
  const a = createHash('sha256').update(submitted).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * One gate attempt: check both limits, and only then compare the PIN and
 * record the result. Does not touch cookies — `lib/auth.ts` issues the
 * session token when this returns 'ok'.
 */
export async function attemptGate(pin: string, ip: string): Promise<GateStatus> {
  const passcode = process.env.HOUSE_PASSCODE
  const secret = process.env.AUTH_SECRET
  if (!passcode || !secret) return 'misconfigured'

  const ipHash = hashIp(ip, secret)

  // The transaction-level lock_timeout is not something a local try/catch
  // around the individual query can absorb: postgres.js tracks every
  // query's rejection at the transaction scope and rethrows it once the
  // callback settles, even if the callback itself handled it, since the
  // underlying Postgres transaction is aborted the moment any statement in
  // it errors. So this catches the whole `sql.begin` instead — by the time
  // it rejects, postgres.js has already issued the matching `rollback`.
  try {
    return await sql.begin(async (tx) => {
      // A literal, not a bound parameter: SET does not accept placeholders,
      // and LOCK_TIMEOUT is a hardcoded constant, never user input.
      await tx.unsafe(`set local lock_timeout = '${LOCK_TIMEOUT}'`)
      await tx`select pg_advisory_xact_lock(${GATE_LOCK_KEY})`

      // Opportunistic retention. auth_attempts only — never any other table.
      await tx`
        delete from auth_attempts
        where created_at < now() - make_interval(secs => ${ATTEMPT_RETENTION_MS / 1000})
      `

      // clock_timestamp(), not now(): now() is transaction-start time, which
      // predates the lock wait above. A request that queued for several
      // seconds must count failures as of right now, not as of when it
      // arrived, or it could momentarily see a stale (too-small) count.
      const [counts] = await tx`
        select
          count(*) filter (
            where ip_hash = ${ipHash}
              and created_at > clock_timestamp() - make_interval(secs => ${IP_WINDOW_MS / 1000})
          )::int as ip_failures,
          count(*)::int as global_failures
        from auth_attempts
        where success = false
          and created_at > clock_timestamp() - make_interval(secs => ${GLOBAL_WINDOW_MS / 1000})
      `

      // Limits BEFORE the comparison: a locked-out request must not learn
      // whether its guess was right. Locked requests are not recorded.
      const decision = decideGateAttempt({
        ipFailures: Number(counts.ip_failures),
        globalFailures: Number(counts.global_failures),
      })
      if (!decision.allowed) return decision.reason === 'global' ? 'locked-global' : 'locked-ip'

      const ok = pinMatches(pin, passcode)
      await tx`
        insert into auth_attempts (ip_hash, success, created_at)
        values (${ipHash}, ${ok}, clock_timestamp())
      `
      return ok ? 'ok' : 'wrong'
    })
  } catch (err) {
    // Fail closed: no guess was compared, no cookie is set. postgres.js has
    // already rolled back the transaction, so nothing was recorded either.
    if (isLockTimeout(err)) return 'busy'
    throw err
  }
}
