import { describe, expect, it } from 'vitest'
import { readSessionToken, signSessionToken } from '@/lib/auth-token'
import { deriveInviteToken, verifyInviteToken } from '@/lib/domain/invite'

const keys = { secret: 'a-long-random-auth-secret-for-tests', passcode: '4821' }
const now = 1_790_000_000_000
const player = '11111111-2222-3333-4444-555555555555'

describe('invite reset revokes every session', () => {
  it('a cookie issued under version 1 is stale once the house is on version 2', () => {
    const token = signSessionToken({ issuedAtMs: now, playerId: player, inviteVersion: 1 }, keys)
    const claims = readSessionToken(token, keys, now)
    expect(claims).not.toBeNull()
    // What requireSession() does with the version it reads from the database.
    expect(claims!.inviteVersion === 1).toBe(true)
    expect(claims!.inviteVersion === 2).toBe(false)
  })

  it('a link from the old version no longer opens the door', () => {
    const old = deriveInviteToken(keys.secret, 1)
    expect(verifyInviteToken(old, keys.secret, 2)).toBe(false)
    expect(verifyInviteToken(deriveInviteToken(keys.secret, 2), keys.secret, 2)).toBe(true)
  })

  it('claiming a player keeps the phone signed in under the same version', () => {
    const before = readSessionToken(
      signSessionToken({ issuedAtMs: now, playerId: null, inviteVersion: 3 }, keys),
      keys,
      now,
    )
    const after = readSessionToken(
      signSessionToken({ issuedAtMs: now, playerId: player, inviteVersion: 3 }, keys),
      keys,
      now,
    )
    expect(before!.playerId).toBeNull()
    expect(after!.playerId).toBe(player)
    expect(after!.inviteVersion).toBe(before!.inviteVersion)
  })
})
