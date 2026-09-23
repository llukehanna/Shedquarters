import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// requireSession() used to call getInviteVersion() directly, so a request
// that checked the gate three times (roster's layout, its page, then
// currentPlayerId()) paid for three house_settings reads. lib/auth.ts now
// wraps it in React's cache(): const currentInviteVersion =
// cache(getInviteVersion), and requireSession() calls that instead.
//
// A caveat this file has to work around: React's cache() only memoizes
// inside the "react-server" condition's request dispatcher, which is
// supplied by Next.js's server render — not by this plain-node vitest
// environment. A quick spike (`cache(fn)` called twice outside any render)
// confirmed the real export just calls `fn` every time here, so a test that
// imports the genuine 'react' cache() cannot observe the dedup it is meant
// to prove. This file replaces 'react' with a minimal stand-in that keeps
// cache()'s one real contract — one memoized result per *wrapper instance*
// — and uses vi.resetModules() to stand in for a new request: lib/auth.ts
// builds that wrapper once at module load, so resetting the module registry
// forces `cache(getInviteVersion)` to run again with a fresh, empty cell,
// the same way a new request gets a fresh cache scope in production.
vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T): T => {
    let hasRun = false
    let result: unknown
    return (async (...args: Parameters<T>) => {
      if (!hasRun) {
        hasRun = true
        result = await fn(...args)
      }
      return result
    }) as T
  },
}))

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

const keys = { secret: 'a-long-random-auth-secret-for-tests', passcode: '4821' }
const player = '11111111-2222-3333-4444-555555555555'

describe('requireSession invite-version caching', () => {
  const originalSecret = process.env.AUTH_SECRET
  const originalPasscode = process.env.HOUSE_PASSCODE

  beforeEach(() => {
    process.env.AUTH_SECRET = keys.secret
    process.env.HOUSE_PASSCODE = keys.passcode
    identityMock.getInviteVersion.mockReset()
    identityMock.getInviteVersion.mockResolvedValue(1)
  })

  afterEach(() => {
    process.env.AUTH_SECRET = originalSecret
    process.env.HOUSE_PASSCODE = originalPasscode
    h.setCookie(undefined)
  })

  it('collapses repeated requireSession() calls within one scope into one read', async () => {
    vi.resetModules()
    const { signSessionToken } = await import('@/lib/auth-token')
    const { currentPlayerId } = await import('@/lib/auth')
    h.setCookie(signSessionToken({ issuedAtMs: Date.now(), playerId: player, inviteVersion: 1 }, keys))

    // Three calls, mirroring /roster: its layout's requirePasscode(), its
    // page's requirePasscode(), and then currentPlayerId() — each of which
    // runs requireSession() on its own.
    await currentPlayerId()
    await currentPlayerId()
    await currentPlayerId()

    expect(identityMock.getInviteVersion).toHaveBeenCalledTimes(1)
  })

  it('a new scope re-reads rather than reusing the last cached version', async () => {
    vi.resetModules()
    const { signSessionToken: sign1 } = await import('@/lib/auth-token')
    const first = await import('@/lib/auth')
    h.setCookie(sign1({ issuedAtMs: Date.now(), playerId: player, inviteVersion: 1 }, keys))
    await first.currentPlayerId()
    await first.currentPlayerId()
    expect(identityMock.getInviteVersion).toHaveBeenCalledTimes(1)

    // A bumped invite version the house reset past — this scope must see it,
    // not the value the first scope cached.
    identityMock.getInviteVersion.mockResolvedValue(2)
    vi.resetModules()
    const { signSessionToken: sign2 } = await import('@/lib/auth-token')
    const second = await import('@/lib/auth')
    h.setCookie(sign2({ issuedAtMs: Date.now(), playerId: player, inviteVersion: 1 }, keys))

    expect(await second.currentPlayerId()).toBeNull() // stale version 1 under the now-current version 2
    expect(identityMock.getInviteVersion).toHaveBeenCalledTimes(2)
  })
})
