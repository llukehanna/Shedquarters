import type { LogGameInput } from '@/lib/types'

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/**
 * Validates an untrusted request body at the HTTP boundary.
 *
 * `winner` matters most: logGame compares it with `=== 'holders'`, so an
 * unvalidated cast turns any other value — a typo, a truncated body, a stray
 * `null` — into a silently recorded *challengers* win. There is no way to tell
 * afterwards that it was never a real result, and games are append-only.
 *
 * Pure and database-free so it can be unit tested and so the route can reject
 * a malformed payload before touching Postgres.
 */
export function parseLogGameInput(body: unknown): LogGameInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('invalid request body')
  }
  const b = body as Record<string, unknown>

  if (!isNonEmptyString(b.clientId)) throw new Error('invalid request body: clientId')
  if (!isNonEmptyString(b.sessionId)) throw new Error('invalid request body: sessionId')
  if (b.winner !== 'holders' && b.winner !== 'challengers') {
    throw new Error('invalid request body: winner')
  }
  if (typeof b.loserScore !== 'number' || !Number.isInteger(b.loserScore) || b.loserScore < 0) {
    throw new Error('invalid request body: loserScore')
  }
  if (!Array.isArray(b.nextChallengers) || !b.nextChallengers.every(isNonEmptyString)) {
    throw new Error('invalid request body: nextChallengers')
  }

  // Absent is fine (see LogGameInput). Present, it has to be a real target;
  // whether it is one this night's sport allows is logGame's call.
  if (
    b.targetScore !== undefined &&
    (typeof b.targetScore !== 'number' || !Number.isInteger(b.targetScore) || b.targetScore <= 0)
  ) {
    throw new Error('invalid request body: targetScore')
  }

  const input: LogGameInput = {
    clientId: b.clientId,
    sessionId: b.sessionId,
    winner: b.winner,
    loserScore: b.loserScore,
    nextChallengers: b.nextChallengers,
  }
  if (b.targetScore !== undefined) input.targetScore = b.targetScore
  return input
}
