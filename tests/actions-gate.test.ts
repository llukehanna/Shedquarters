import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * A signed-out phone tapping a button must be sent to the gate, not shown a
 * 500. The whole point of the gate helper is that `requirePasscode()`'s throw
 * never escapes an action, so these tests assert the redirect and — just as
 * importantly — that the underlying database work never runs.
 */
const requirePasscode = vi.fn()
const setClaim = vi.fn()
const startSession = vi.fn()
const addPlayer = vi.fn()
const claimPlayerRow = vi.fn()
const renamePlayer = vi.fn()
const addNickname = vi.fn()
const removeNickname = vi.fn()

vi.mock('@/lib/auth', () => ({ requirePasscode, setClaim }))
vi.mock('@/lib/identity', () => ({ claimPlayer: claimPlayerRow }))
vi.mock('@/lib/queries', () => ({ getPlayers: vi.fn(async () => []) }))
vi.mock('@/lib/session', () => ({
  startSession,
  addPlayer,
  logGame: vi.fn(),
  voidLastGame: vi.fn(),
  endSession: vi.fn(),
  renamePlayer,
  addNickname,
  removeNickname,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))

const actions = await import('@/lib/actions')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the action gate', () => {
  it('redirects a signed-out phone to the gate instead of throwing unauthorized', async () => {
    requirePasscode.mockRejectedValue(new Error('unauthorized'))
    await expect(actions.startSession(['a'], ['b'])).rejects.toThrow('NEXT_REDIRECT:/gate')
    expect(startSession).not.toHaveBeenCalled()
  })

  it('redirects on every gated action, not just one', async () => {
    requirePasscode.mockRejectedValue(new Error('unauthorized'))
    await expect(actions.claimPlayer('id')).rejects.toThrow('NEXT_REDIRECT:/gate')
    await expect(actions.addAndClaimGuest('Guest')).rejects.toThrow('NEXT_REDIRECT:/gate')
    await expect(actions.addPlayer('Name', true)).rejects.toThrow('NEXT_REDIRECT:/gate')
    await expect(actions.renamePlayer('id', 'New Name')).rejects.toThrow('NEXT_REDIRECT:/gate')
    await expect(actions.addNickname('id', 'Nick')).rejects.toThrow('NEXT_REDIRECT:/gate')
    await expect(actions.removeNickname('id', 'Nick')).rejects.toThrow('NEXT_REDIRECT:/gate')
    expect(claimPlayerRow).not.toHaveBeenCalled()
    expect(addPlayer).not.toHaveBeenCalled()
    expect(renamePlayer).not.toHaveBeenCalled()
    expect(addNickname).not.toHaveBeenCalled()
    expect(removeNickname).not.toHaveBeenCalled()
  })

  it('lets a signed-in phone through to the real work', async () => {
    requirePasscode.mockResolvedValue(undefined)
    startSession.mockResolvedValue('session-1')
    await expect(actions.startSession(['a'], ['b'])).resolves.toBe('session-1')
    expect(startSession).toHaveBeenCalledWith(['a'], ['b'])
  })
})

describe('the action gate only redirects a signed-out phone', () => {
  it('sends a real server fault to the error screen instead of the gate', async () => {
    // A missing AUTH_SECRET or a database that will not answer is not a
    // signed-out phone: redirecting would tell someone to re-enter a PIN that
    // cannot fix anything, and hide the fault from the error boundary.
    requirePasscode.mockRejectedValue(new Error('AUTH_SECRET is not set'))
    await expect(actions.startSession(['a'], ['b'])).rejects.toThrow('AUTH_SECRET is not set')
    expect(startSession).not.toHaveBeenCalled()
  })

  it('still redirects when the session really is unauthorized', async () => {
    requirePasscode.mockRejectedValue(new Error('unauthorized'))
    await expect(actions.startSession(['a'], ['b'])).rejects.toThrow('NEXT_REDIRECT:/gate')
  })
})
