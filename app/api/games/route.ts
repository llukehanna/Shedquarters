import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePasscode } from '@/lib/auth'
import { logGame } from '@/lib/session'
import { parseLogGameInput } from '@/lib/domain/validate'

/**
 * The rejections that are genuinely the caller's fault and will never succeed
 * on retry. Enumerated from `parseLogGameInput` and `logGame`.
 *
 * This is deliberately an allowlist rather than a fallback. The offline queue
 * treats any 4xx other than 401 as terminal: the game is moved off the queue
 * into the dead-letter list and never retried. So every message that reaches
 * the catch below and is *not* one of these — postgres refusing a connection
 * during a Neon cold start, a CONNECT_TIMEOUT, a statement timeout, a uuid
 * cast error from a sessionId that is a non-empty string but not a uuid, or
 * simply a bug in this route — must be a 500, so the game stays queued.
 *
 * A wedged queue is recoverable. A discarded game is not.
 */
const CLIENT_FAULT_MESSAGES = new Set([
  // lib/domain/validate.ts, plus the non-JSON body case below
  'invalid request body',
  'invalid request body: clientId',
  'invalid request body: sessionId',
  'invalid request body: winner',
  'invalid request body: loserScore',
  'invalid request body: nextChallengers',
  'invalid request body: targetScore',
  // lib/session.ts — logGame and the assertDistinct it calls
  'session has ended',
  'session not found',
  'session has no table state',
  'invalid target score for this game',
  'a player cannot be on both teams',
  'duplicate player on a team',
])

// `invalid losing score: N` interpolates the offending value, so it is the one
// client-fault message that has to be matched by prefix rather than equality.
const CLIENT_FAULT_PREFIXES = ['invalid losing score: ']

function statusFor(message: string): number {
  // 401: retryable, because the session cookie can be re-established and the
  // queued game then goes through unchanged.
  if (message === 'unauthorized') return 401
  // Server misconfiguration is never the caller's fault.
  if (message === 'HOUSE_PASSCODE is not set') return 500
  if (message === 'AUTH_SECRET is not set') return 500
  if (CLIENT_FAULT_MESSAGES.has(message)) return 400
  if (CLIENT_FAULT_PREFIXES.some((prefix) => message.startsWith(prefix))) return 400
  return 500
}

export async function POST(req: Request) {
  try {
    // This is a public HTTP endpoint: it enforces the passcode itself rather
    // than inheriting it from a server action, and validates the body rather
    // than casting it.
    await requirePasscode()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      throw new Error('invalid request body')
    }

    await logGame(parseLogGameInput(body))
    revalidatePath('/')
    revalidatePath('/table')
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ ok: false, error: message }, { status: statusFor(message) })
  }
}
