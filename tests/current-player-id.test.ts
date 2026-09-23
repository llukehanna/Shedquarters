import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// currentPlayerId() must swallow only "no valid session" and let everything
// else propagate — an unset secret or a database error from
// getInviteVersion() must fail loudly, not render every visitor anonymous.
// Both next/headers and lib/identity are mocked so this runs with no request
// context and no database.
const h = vi.hoisted(() => {
  let cookieValue: string | undefined
  return {
    setCookie: (v: string | undefined) => {
      cookieValue = v
    },
    getCookie: () => cookieValue,
  }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'house' && h.getCookie() ? { value: h.getCookie() } : undefined),
    set: vi.fn(),
  }),
  headers: async () => new Headers(),
}))

const identityMock = vi.hoisted(() => ({ getInviteVersion: vi.fn() }))
vi.mock('@/lib/identity', () => identityMock)

import { currentPlayerId } from '@/lib/auth'
import { signSessionToken } from '@/lib/auth-token'

const keys = { secret: 'a-long-random-auth-secret-for-tests', passcode: '4821' }
const player = '11111111-2222-3333-4444-555555555555'

describe('currentPlayerId', () => {
  const originalSecret = process.env.AUTH_SECRET
  const originalPasscode = process.env.HOUSE_PASSCODE

  beforeEach(() => {
    process.env.AUTH_SECRET = keys.secret
    process.env.HOUSE_PASSCODE = keys.passcode
    identityMock.getInviteVersion.mockReset()
    h.setCookie(undefined)
  })

  afterEach(() => {
    process.env.AUTH_SECRET = originalSecret
    process.env.HOUSE_PASSCODE = originalPasscode
  })

  it('returns null when there is no session cookie', async () => {
    identityMock.getInviteVersion.mockResolvedValue(1)
    expect(await currentPlayerId()).toBeNull()
  })

  it('returns null when the session is under a stale invite version', async () => {
    h.setCookie(signSessionToken({ issuedAtMs: Date.now(), playerId: player, inviteVersion: 1 }, keys))
    identityMock.getInviteVersion.mockResolvedValue(2)
    expect(await currentPlayerId()).toBeNull()
  })

  it('returns the claimed player for a valid session', async () => {
    h.setCookie(signSessionToken({ issuedAtMs: Date.now(), playerId: player, inviteVersion: 1 }, keys))
    identityMock.getInviteVersion.mockResolvedValue(1)
    expect(await currentPlayerId()).toBe(player)
  })

  it('propagates a database error instead of reporting anonymous', async () => {
    h.setCookie(signSessionToken({ issuedAtMs: Date.now(), playerId: player, inviteVersion: 1 }, keys))
    identityMock.getInviteVersion.mockRejectedValue(new Error('connection refused'))
    await expect(currentPlayerId()).rejects.toThrow('connection refused')
  })

  it('propagates a missing-secret misconfiguration instead of reporting anonymous', async () => {
    delete process.env.AUTH_SECRET
    await expect(currentPlayerId()).rejects.toThrow('AUTH_SECRET is not set')
  })
})
