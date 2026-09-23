import { beforeEach, describe, expect, it, vi } from 'vitest'

// The offline queue keys its retry policy off the status this route returns:
// 401 and 5xx are retried forever, any other 4xx is terminal and the game is
// dead-lettered. So the mapping below is load-bearing — a misconfigured
// server reported as 400 silently discards a real game, and a malformed
// payload reported as 500 wedges the queue.
vi.mock('@/lib/auth', () => ({ requirePasscode: vi.fn() }))
vi.mock('@/lib/session', () => ({ logGame: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST } from '@/app/api/games/route'
import { requirePasscode } from '@/lib/auth'
import { logGame } from '@/lib/session'
import type { LogGameInput } from '@/lib/types'

const valid: LogGameInput = {
  clientId: '6f1a2b3c-0000-4000-8000-000000000001',
  sessionId: '6f1a2b3c-0000-4000-8000-000000000002',
  winner: 'holders',
  loserScore: 12,
  nextChallengers: ['p1', 'p2', 'p3'],
}

function post(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.mocked(requirePasscode).mockReset().mockResolvedValue(undefined)
  vi.mocked(logGame).mockReset().mockResolvedValue(undefined)
})

describe('POST /api/games status mapping', () => {
  it('accepts a well-formed body and passes it through', async () => {
    const res = await POST(post(valid))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(logGame).toHaveBeenCalledWith(valid)
  })

  it('returns 401 for a missing/incorrect passcode — retryable, never dead-lettered', async () => {
    vi.mocked(requirePasscode).mockRejectedValue(new Error('unauthorized'))

    const res = await POST(post(valid))

    expect(res.status).toBe(401)
    expect(logGame).not.toHaveBeenCalled()
  })

  it('returns 500 when HOUSE_PASSCODE is unset — server misconfiguration, retryable', async () => {
    vi.mocked(requirePasscode).mockRejectedValue(new Error('HOUSE_PASSCODE is not set'))

    const res = await POST(post(valid))

    expect(res.status).toBe(500)
    expect(logGame).not.toHaveBeenCalled()
  })

  it('returns 500 when AUTH_SECRET is unset — server misconfiguration, retryable', async () => {
    vi.mocked(requirePasscode).mockRejectedValue(new Error('AUTH_SECRET is not set'))

    const res = await POST(post(valid))

    expect(res.status).toBe(500)
    expect(logGame).not.toHaveBeenCalled()
  })

  it('returns 400 when the session has ended — terminal, the queue must stop retrying', async () => {
    vi.mocked(logGame).mockRejectedValue(new Error('session has ended'))

    const res = await POST(post(valid))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'session has ended' })
  })

  it('returns 400 for a domain rejection from logGame', async () => {
    vi.mocked(logGame).mockRejectedValue(new Error('a player cannot be on both teams'))

    expect((await POST(post(valid))).status).toBe(400)
  })
})

describe('POST /api/games body validation', () => {
  // `winner` is compared with === 'holders' downstream, so an unvalidated
  // cast records anything else as a *challengers* win — silently, and into an
  // append-only table.
  it('rejects an unknown winner value instead of recording a challengers win', async () => {
    const res = await POST(post({ ...valid, winner: 'HOLDERS' }))

    expect(res.status).toBe(400)
    expect(logGame).not.toHaveBeenCalled()
  })

  it.each([
    ['missing clientId', { ...valid, clientId: undefined }],
    ['non-string sessionId', { ...valid, sessionId: 42 }],
    ['missing winner', { ...valid, winner: undefined }],
    ['fractional loserScore', { ...valid, loserScore: 3.5 }],
    ['negative loserScore', { ...valid, loserScore: -1 }],
    ['string loserScore', { ...valid, loserScore: '12' }],
    ['nextChallengers not an array', { ...valid, nextChallengers: 'p1' }],
    ['nextChallengers holding a non-string', { ...valid, nextChallengers: ['p1', 7] }],
    ['an array body', [valid]],
    ['a null body', null],
    ['a string body', 'hello'],
  ])('rejects %s with 400 and never reaches logGame', async (_label, body) => {
    const res = await POST(post(body))

    expect(res.status).toBe(400)
    expect(logGame).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON at all with 400', async () => {
    const res = await POST(post(undefined, 'not json{{{'))

    expect(res.status).toBe(400)
    expect(logGame).not.toHaveBeenCalled()
  })
})

// The status this route returns *is* the queue's retry policy, and the queue
// is now destructive about 400: a dead-lettered game is off the queue and will
// never be sent again. So a failure that is not the caller's fault must not be
// reported as 400. These are the realistic ones — docs/OPERATIONS.md documents Neon's
// scale-to-zero cold start as an expected condition, which is exactly how a
// database blip reaches this catch block during a party.
describe('POST /api/games — transient and unexpected failures stay retryable', () => {
  it.each([
    ['postgres refusing a connection', 'connect ECONNREFUSED 127.0.0.1:5432'],
    ['a Neon cold-start connect timeout', 'CONNECT_TIMEOUT'],
    ['a statement timeout', 'canceling statement due to statement timeout'],
    ['a uuid cast error from a non-uuid sessionId', 'invalid input syntax for type uuid: "not-a-uuid"'],
    ['an unexpected internal error', 'Cannot read properties of undefined (reading \'holders\')'],
  ])('returns 500 for %s, so the queue retries instead of dead-lettering', async (_label, message) => {
    vi.mocked(logGame).mockRejectedValue(new Error(message))

    const res = await POST(post(valid))

    expect(res.status).toBe(500)
  })

  it('returns 500 for a non-Error throw rather than discarding the game', async () => {
    vi.mocked(logGame).mockRejectedValue('something went sideways')

    expect((await POST(post(valid))).status).toBe(500)
  })

  // The interpolated value means this one cannot be matched by equality; if the
  // prefix match were dropped it would fall through to 500 and wedge the queue
  // on a payload that can never be accepted.
  it('still returns 400 for an invalid losing score, which interpolates its value', async () => {
    vi.mocked(logGame).mockRejectedValue(new Error('invalid losing score: 4'))

    expect((await POST(post(valid))).status).toBe(400)
  })

  it.each([
    'session not found',
    'session has no table state',
    'duplicate player on a team',
  ])('still returns 400 for the known client fault %s', async (message) => {
    vi.mocked(logGame).mockRejectedValue(new Error(message))

    expect((await POST(post(valid))).status).toBe(400)
  })
})
