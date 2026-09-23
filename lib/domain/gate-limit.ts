/**
 * Rate limits for the gate — the only place a PIN guess is ever checked.
 *
 * The house passcode is a 4-digit PIN by product decision, so the keyspace is
 * 10,000. What makes that safe is the global limit: attackers rotate IPs, so
 * the per-IP limit only keeps one fat-fingered phone from burning the whole
 * house's budget. With at most GLOBAL_FAILURE_LIMIT wrong guesses per rolling
 * day across every client, a 4-digit PIN takes ~250 days on average to find
 * (see docs/ACCESS.md).
 *
 * Only failures count. A successful login is recorded but never locks anyone.
 */

export const IP_FAILURE_LIMIT = 5
export const IP_WINDOW_MS = 15 * 60 * 1000

export const GLOBAL_FAILURE_LIMIT = 20
export const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000

/** auth_attempts rows older than this are deleted opportunistically. */
export const ATTEMPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface FailureCounts {
  /** Failed attempts from this client's IP within IP_WINDOW_MS. */
  ipFailures: number
  /** Failed attempts from every client within GLOBAL_WINDOW_MS. */
  globalFailures: number
}

export type LockReason = 'ip' | 'global'

export type GateDecision = { allowed: true } | { allowed: false; reason: LockReason }

/**
 * Decide whether a gate attempt may compare its PIN at all. Must be called
 * before the comparison, so a locked-out request learns nothing about whether
 * its guess was right.
 *
 * The global lock is reported in preference to the per-IP one: it is the
 * condition the person at the gate needs to know about (waiting 15 minutes
 * will not help them).
 */
export function decideGateAttempt(counts: FailureCounts): GateDecision {
  if (counts.globalFailures >= GLOBAL_FAILURE_LIMIT) return { allowed: false, reason: 'global' }
  if (counts.ipFailures >= IP_FAILURE_LIMIT) return { allowed: false, reason: 'ip' }
  return { allowed: true }
}

/**
 * What the gate tells the person who submitted a PIN. Plain data so the
 * client form can import the type without pulling in server code.
 *
 * `misconfigured` is the fail-closed case: HOUSE_PASSCODE or AUTH_SECRET is
 * unset, so nothing can be accepted. `busy` is also fail-closed: the
 * advisory lock in `lib/gate.ts` timed out under contention, so the guess
 * was never compared and nothing was recorded — same as `misconfigured` but
 * transient.
 */
export type GateStatus = 'ok' | 'wrong' | 'locked-ip' | 'locked-global' | 'misconfigured' | 'busy'

/** Rate-limit bucket for requests whose client IP cannot be determined. */
export const UNKNOWN_IP = 'unknown'

/**
 * The client IP as Vercel reports it. Vercel overwrites `x-forwarded-for`
 * with the real client address and does not forward client-supplied values,
 * to prevent spoofing; `x-vercel-forwarded-for` and `x-real-ip` carry the
 * same value, and `x-vercel-forwarded-for` survives a proxy in front of
 * Vercel. Off Vercel (e.g. `next dev`) these headers are client-controlled,
 * which only affects the per-IP limit — the global limit does not use the IP.
 *
 * An unreadable IP falls into one shared UNKNOWN_IP bucket rather than
 * skipping the per-IP limit.
 */
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    const first = headers.get(name)?.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  return UNKNOWN_IP
}
