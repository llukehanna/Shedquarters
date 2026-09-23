import { describe, expect, it } from 'vitest'
import { deriveInviteToken, verifyInviteToken } from '@/lib/domain/invite'

const secret = 'a-long-random-auth-secret-for-tests'

describe('invite tokens', () => {
  it('is stable for a version', () => {
    expect(deriveInviteToken(secret, 1)).toBe(deriveInviteToken(secret, 1))
  })

  it('changes when the version is bumped', () => {
    expect(deriveInviteToken(secret, 2)).not.toBe(deriveInviteToken(secret, 1))
  })

  it('changes when the secret changes', () => {
    expect(deriveInviteToken('another-secret-entirely', 1)).not.toBe(deriveInviteToken(secret, 1))
  })

  it('is url-safe and long enough not to guess', () => {
    const token = deriveInviteToken(secret, 1)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('accepts the token for its own version', () => {
    expect(verifyInviteToken(deriveInviteToken(secret, 7), secret, 7)).toBe(true)
  })

  it('rejects a token from a previous version', () => {
    expect(verifyInviteToken(deriveInviteToken(secret, 1), secret, 2)).toBe(false)
  })

  it('rejects garbage without throwing', () => {
    expect(verifyInviteToken('', secret, 1)).toBe(false)
    expect(verifyInviteToken(undefined, secret, 1)).toBe(false)
    expect(verifyInviteToken('../../etc/passwd', secret, 1)).toBe(false)
    expect(verifyInviteToken('x'.repeat(5000), secret, 1)).toBe(false)
  })

  it('rejects everything when the secret is missing', () => {
    expect(verifyInviteToken(deriveInviteToken(secret, 1), '', 1)).toBe(false)
  })

  it('rejects valid token with version 0', () => {
    expect(verifyInviteToken(deriveInviteToken(secret, 1), secret, 0)).toBe(false)
  })

  it('rejects valid token with NaN version', () => {
    expect(verifyInviteToken(deriveInviteToken(secret, 1), secret, NaN)).toBe(false)
  })

  it('rejects valid token with non-integer version', () => {
    expect(verifyInviteToken(deriveInviteToken(secret, 1), secret, 1.5)).toBe(false)
  })

  it('rejects valid token with string version cast to number', () => {
    expect(verifyInviteToken(deriveInviteToken(secret, 1), secret, '1' as unknown as number)).toBe(false)
  })
})
