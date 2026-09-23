import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signed session tokens for the `house` cookie.
 *
 * Format: `<tag>.<issuedAt>.<playerId or '-'>.<inviteVersion>.<signature>`, where
 * the signature is HMAC-SHA256(AUTH_SECRET, …) over all of it plus
 * sha256(HOUSE_PASSCODE). The cookie has never held the PIN itself, so a
 * forged `Cookie: house=1234` sent straight at a write endpoint is just an
 * invalid token; the PIN is only ever checked at the rate-limited gate.
 *
 * Two fields are signed alongside the timestamp, and both are revocation
 * levers:
 *   - the claimed player id, so the server knows whose phone this is;
 *   - the invite version the phone entered under, so bumping the version
 *     (resetting the invite link) invalidates every token at once.
 * Changing HOUSE_PASSCODE still invalidates every token for the same reason.
 *
 * Pure: no request context, no environment reads. `lib/auth.ts` supplies the
 * secrets, the current invite version, and the clock.
 */

/** Matches the cookie max-age. */
export const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

/**
 * A token issued this far in the future is still accepted, to tolerate clock
 * skew between serverless instances. Anything further ahead is rejected.
 */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

/** Stands in for the player id on a phone that has not claimed anyone. */
const UNCLAIMED = '-'

/**
 * The format new cookies are issued in.
 *
 * Changing the shape of a token is not a free deploy: it signs out every phone
 * in the house at once, which is how a housemate ended up staring at a React
 * error mid-game. When the format has to change, add the new tag here and
 * leave the old one in ACCEPTED_FORMATS for at least one release, so phones
 * carrying the previous format keep working until they are re-issued.
 *
 * Deliberately NOT a revocation lever: the PIN hash and the invite version
 * inside the signature are the two ways to sign the house out on purpose.
 */
export const CURRENT_FORMAT = 'v2'

/**
 * Every format this build still reads. Retire a tag only once every phone has
 * been re-issued (a year, or after a PIN change or invite reset, whichever
 * comes first).
 */
export const ACCEPTED_FORMATS: readonly string[] = [CURRENT_FORMAT]

export interface TokenKeys {
  /** AUTH_SECRET */
  secret: string
  /** HOUSE_PASSCODE */
  passcode: string
}

export interface SessionClaims {
  issuedAtMs: number
  /** The claimed player, or null on a phone that skipped "who are you". */
  playerId: string | null
  inviteVersion: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function signature(
  format: string,
  issuedAt: string,
  player: string,
  version: string,
  keys: TokenKeys,
): Buffer {
  const pinHash = createHash('sha256').update(keys.passcode).digest('hex')
  // The format tag is inside the signature, so a token cannot be replayed
  // under a different format's rules by rewriting its first segment.
  return createHmac('sha256', keys.secret)
    .update(`house-session.${format}\n${issuedAt}\n${player}\n${version}\n${pinHash}`)
    .digest()
}

export function signSessionToken(claims: SessionClaims, keys: TokenKeys): string {
  if (!keys.secret || !keys.passcode) throw new Error('cannot sign a session without both secrets')
  if (!Number.isSafeInteger(claims.issuedAtMs) || claims.issuedAtMs < 0) {
    throw new Error('invalid issuedAt')
  }
  if (!Number.isSafeInteger(claims.inviteVersion) || claims.inviteVersion < 1) {
    throw new Error('invalid invite version')
  }
  if (claims.playerId !== null && !UUID.test(claims.playerId)) throw new Error('invalid player id')

  const issuedAt = String(claims.issuedAtMs)
  const player = claims.playerId ?? UNCLAIMED
  const version = String(claims.inviteVersion)
  const sig = signature(CURRENT_FORMAT, issuedAt, player, version, keys).toString('base64url')
  return `${CURRENT_FORMAT}.${issuedAt}.${player}.${version}.${sig}`
}

/**
 * The claims of a well-formed, correctly signed, unexpired token, or null.
 * Never throws: every malformed input is simply null. Callers still have to
 * compare `inviteVersion` against the house's current version.
 */
export function readSessionToken(
  token: string | undefined | null,
  keys: TokenKeys,
  nowMs: number,
): SessionClaims | null {
  if (!keys.secret || !keys.passcode) return null
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) return null

  const parts = token.split('.')
  if (parts.length !== 5) return null
  const [format, issuedAt, player, version, sig] = parts
  if (!ACCEPTED_FORMATS.includes(format)) return null

  // Canonical decimal only: no sign, no leading zeros, no exponent.
  if (!/^(0|[1-9]\d{0,15})$/.test(issuedAt)) return null
  if (!/^[1-9]\d{0,8}$/.test(version)) return null
  if (player !== UNCLAIMED && !UUID.test(player)) return null
  if (!/^[A-Za-z0-9_-]+$/.test(sig)) return null

  const presented = Buffer.from(sig, 'base64url')
  const expected = signature(format, issuedAt, player, version, keys)
  if (presented.length !== expected.length) return null
  if (!timingSafeEqual(presented, expected)) return null

  const issuedAtMs = Number(issuedAt)
  if (issuedAtMs > nowMs + MAX_CLOCK_SKEW_MS) return null
  if (nowMs - issuedAtMs > SESSION_MAX_AGE_MS) return null

  return {
    issuedAtMs,
    playerId: player === UNCLAIMED ? null : player,
    inviteVersion: Number(version),
  }
}
