import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_FORMATS,
  CURRENT_FORMAT,
  SESSION_MAX_AGE_MS,
  readSessionToken,
  signSessionToken,
} from '@/lib/auth-token'

const keys = { secret: 'a-long-random-auth-secret-for-tests', passcode: '4821' }
const issuedAtMs = 1_790_000_000_000
const now = issuedAtMs + 60_000
const player = '11111111-2222-3333-4444-555555555555'
const claims = { issuedAtMs, playerId: player, inviteVersion: 1 }

// Flips a character in the middle of the string, not the last one: a
// 43-char base64url signature's last character carries only 4 significant
// bits, so flipping it can decode to the identical 32 bytes roughly one time
// in sixteen. A middle character is always fully significant.
function flipMiddleChar(s: string): string {
  const i = Math.floor(s.length / 2)
  const c = s[i]
  return s.slice(0, i) + (c === 'A' ? 'B' : 'A') + s.slice(i + 1)
}

// Replicates lib/auth-token.ts's internal `signature()` exactly, so a test
// can forge a token whose fields are non-canonical (a leading zero, a zero
// version) but whose signature genuinely matches those exact bytes — the
// only way to prove the canonical-form regex checks are themselves doing the
// rejecting, rather than relying on a signature mismatch as a backstop.
function forge(issuedAt: string, forPlayer: string, version: string): string {
  const pinHash = createHash('sha256').update(keys.passcode).digest('hex')
  const sig = createHmac('sha256', keys.secret)
    .update(`house-session.v2\n${issuedAt}\n${forPlayer}\n${version}\n${pinHash}`)
    .digest('base64url')
  return `v2.${issuedAt}.${forPlayer}.${version}.${sig}`
}

describe('session tokens', () => {
  it('round-trips the claims', () => {
    expect(readSessionToken(signSessionToken(claims, keys), keys, now)).toEqual(claims)
  })

  it('round-trips an unclaimed phone', () => {
    const unclaimed = { ...claims, playerId: null }
    expect(readSessionToken(signSessionToken(unclaimed, keys), keys, now)).toEqual(unclaimed)
  })

  it('never contains the PIN', () => {
    const token = signSessionToken(claims, { ...keys, passcode: '987654321' })
    expect(token).not.toContain('987654321')
  })

  it('rejects a tampered signature', () => {
    const parts = signSessionToken(claims, keys).split('.')
    parts[4] = flipMiddleChar(parts[4])
    expect(readSessionToken(parts.join('.'), keys, now)).toBeNull()
  })

  it('rejects a swapped player id', () => {
    const token = signSessionToken(claims, keys)
    const forged = token.replace(player, '99999999-9999-9999-9999-999999999999')
    expect(readSessionToken(forged, keys, now)).toBeNull()
  })

  it('rejects a swapped invite version', () => {
    const token = signSessionToken(claims, keys)
    const parts = token.split('.')
    parts[3] = '2'
    expect(readSessionToken(parts.join('.'), keys, now)).toBeNull()
  })

  it('rejects a token signed under a different PIN', () => {
    const token = signSessionToken(claims, { ...keys, passcode: '0000' })
    expect(readSessionToken(token, keys, now)).toBeNull()
  })

  it('rejects a token signed under a different secret', () => {
    const token = signSessionToken(claims, { ...keys, secret: 'some-other-secret-value' })
    expect(readSessionToken(token, keys, now)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = signSessionToken(claims, keys)
    expect(readSessionToken(token, keys, issuedAtMs + SESSION_MAX_AGE_MS + 1)).toBeNull()
  })

  it('tolerates small clock skew but not a far-future token', () => {
    const token = signSessionToken(claims, keys)
    expect(readSessionToken(token, keys, issuedAtMs - 60_000)).toEqual(claims)
    expect(readSessionToken(token, keys, issuedAtMs - 10 * 60_000)).toBeNull()
  })

  it('rejects malformed input without throwing', () => {
    for (const bad of [undefined, null, '', 'nope', 'v2.abc.def', 'x'.repeat(500)]) {
      expect(readSessionToken(bad, keys, now)).toBeNull()
    }
  })

  it('rejects a v1 token', () => {
    expect(readSessionToken(`${issuedAtMs}.abcdef`, keys, now)).toBeNull()
  })

  it('rejects a leading-zero timestamp even under a genuinely matching signature', () => {
    const token = forge(`0${issuedAtMs}`, player, '1')
    expect(readSessionToken(token, keys, now)).toBeNull()
  })

  it('rejects a zero invite version even under a genuinely matching signature', () => {
    const token = forge(String(issuedAtMs), player, '0')
    expect(readSessionToken(token, keys, now)).toBeNull()
  })

  it('rejects a leading-zero invite version even under a genuinely matching signature', () => {
    const token = forge(String(issuedAtMs), player, '01')
    expect(readSessionToken(token, keys, now)).toBeNull()
  })

  it('rejects a non-UUID player id even under a genuinely matching signature', () => {
    const token = forge(String(issuedAtMs), 'not-a-uuid', '1')
    expect(readSessionToken(token, keys, now)).toBeNull()
  })

  it('rejects an empty player segment even under a genuinely matching signature', () => {
    const token = forge(String(issuedAtMs), '', '1')
    expect(readSessionToken(token, keys, now)).toBeNull()
  })

  it('rejects a non-base64url character in the signature', () => {
    const parts = signSessionToken(claims, keys).split('.')
    parts[4] = `${parts[4].slice(0, -1)}+`
    expect(readSessionToken(parts.join('.'), keys, now)).toBeNull()
  })

  it('rejects a token with an empty segment', () => {
    const parts = signSessionToken(claims, keys).split('.')
    parts[1] = ''
    expect(readSessionToken(parts.join('.'), keys, now)).toBeNull()
  })

  it('refuses to sign without both secrets', () => {
    expect(() => signSessionToken(claims, { ...keys, secret: '' })).toThrow()
    expect(() => signSessionToken(claims, { ...keys, passcode: '' })).toThrow()
  })
})

/**
 * Changing the token format signs out every phone in the house at once — that
 * is what put a minified React error in front of a housemate mid-game. These
 * tests hold the seam that lets the next format change land without doing it
 * again: whatever tags sit in ACCEPTED_FORMATS keep working, and the tag is
 * inside the signature so it cannot be rewritten.
 */
describe('session format compatibility', () => {
  function forgeWithFormat(format: string): string {
    const pinHash = createHash('sha256').update(keys.passcode).digest('hex')
    const sig = createHmac('sha256', keys.secret)
      .update(`house-session.${format}\n${issuedAtMs}\n${player}\n1\n${pinHash}`)
      .digest('base64url')
    return `${format}.${issuedAtMs}.${player}.1.${sig}`
  }

  it('issues tokens in the current format', () => {
    expect(signSessionToken(claims, keys).split('.')[0]).toBe(CURRENT_FORMAT)
  })

  it('still reads the current format after it stops being the only one', () => {
    expect(ACCEPTED_FORMATS).toContain(CURRENT_FORMAT)
  })

  it('reads a correctly signed token in every accepted format', () => {
    for (const format of ACCEPTED_FORMATS) {
      expect(readSessionToken(forgeWithFormat(format), keys, now)).not.toBeNull()
    }
  })

  it('rejects a format this build does not accept', () => {
    expect(ACCEPTED_FORMATS).not.toContain('v1')
    expect(readSessionToken(forgeWithFormat('v1'), keys, now)).toBeNull()
  })

  it('signs the format tag, so it cannot be swapped for an accepted one', () => {
    const parts = forgeWithFormat('v1').split('.')
    parts[0] = CURRENT_FORMAT
    expect(readSessionToken(parts.join('.'), keys, now)).toBeNull()
  })
})
