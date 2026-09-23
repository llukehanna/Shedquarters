import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The house invite token.
 *
 * `token = HMAC-SHA256(AUTH_SECRET, "invite:" + version)`, base64url — 32
 * bytes of output, so it cannot be guessed, which is why invite entry skips
 * the PIN rate limiter. Nothing derived from it is ever stored: the database
 * holds only the integer version, so a database leak exposes no usable link
 * and the server can rebuild the current link whenever it needs to show it.
 *
 * Pure: callers supply the secret and the version.
 */

export function deriveInviteToken(secret: string, version: number): string {
  if (!secret) throw new Error('cannot derive an invite token without AUTH_SECRET')
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('invalid invite version')
  return createHmac('sha256', secret).update(`invite:${version}`).digest('base64url')
}

/** Never throws: any malformed input is simply `false`. */
export function verifyInviteToken(
  token: string | undefined | null,
  secret: string,
  version: number,
): boolean {
  if (!secret) return false
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  if (!Number.isSafeInteger(version) || version < 1) return false

  const expected = Buffer.from(deriveInviteToken(secret, version), 'base64url')
  const presented = Buffer.from(token, 'base64url')
  if (presented.length !== expected.length) return false
  return timingSafeEqual(presented, expected)
}
