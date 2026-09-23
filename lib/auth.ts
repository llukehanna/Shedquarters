import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { timingSafeEqual } from 'node:crypto'
import {
  SESSION_MAX_AGE_MS,
  readSessionToken,
  signSessionToken,
  type SessionClaims,
} from '@/lib/auth-token'
import { verifyInviteToken } from '@/lib/domain/invite'
import { attemptGate } from '@/lib/gate'
import { getInviteVersion } from '@/lib/identity'
import { clientIpFrom, type GateStatus } from '@/lib/domain/gate-limit'

const COOKIE = 'house'

/**
 * getInviteVersion(), deduped per request. requireSession() runs on every
 * gate check (layout, page, and each claim/session action can all check the
 * same request), and each one used to cost its own house_settings read.
 * React's cache() collapses those into one query per request while still
 * reading fresh on the next request, which is what keeps "reset invite link"
 * a real revocation instead of one that a cached process ignores.
 */
const currentInviteVersion = cache(getInviteVersion)

/**
 * Constant-time string comparison. Mismatched lengths are rejected up front
 * since timingSafeEqual requires equal lengths and would otherwise throw.
 * Exported so every secret comparison in the codebase (e.g. the cron backup
 * route's bearer token check) goes through this one implementation rather
 * than a second hand-rolled one.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function secrets(): { secret: string; passcode: string } {
  const passcode = process.env.HOUSE_PASSCODE
  if (!passcode) throw new Error('HOUSE_PASSCODE is not set')
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return { secret, passcode }
}

async function writeCookie(claims: SessionClaims, keys: { secret: string; passcode: string }) {
  const store = await cookies()
  store.set(COOKIE, signSessionToken(claims, keys), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000,
  })
}

/**
 * The claims of the phone making this request.
 *
 * Throws when the cookie is missing, forged, expired, or issued under an
 * invite version the house has since reset past. That last check is what makes
 * "reset invite link" a real revocation rather than a new link beside the old
 * one, and it costs one small query per gated request.
 *
 * Fails closed: an unset HOUSE_PASSCODE or AUTH_SECRET throws.
 */
export async function requireSession(): Promise<SessionClaims> {
  const keys = secrets()
  const store = await cookies()
  const claims = readSessionToken(store.get(COOKIE)?.value, keys, Date.now())
  if (!claims) throw new Error('unauthorized')
  if (claims.inviteVersion !== (await currentInviteVersion())) throw new Error('unauthorized')
  return claims
}

/**
 * A shared house PIN, not authentication; it identifies nobody by itself.
 * Kept as the gate every mutation calls first.
 */
export async function requirePasscode(): Promise<void> {
  await requireSession()
}

/**
 * The claimed player, or null for a phone that is signed in but unclaimed.
 *
 * Only swallows the "no valid session" case. Anything else — an unset
 * AUTH_SECRET/HOUSE_PASSCODE, or a database error from getInviteVersion() —
 * propagates, so a deployment that lost its secret or hit a database blip
 * fails loudly instead of silently rendering every visitor as anonymous.
 */
export async function currentPlayerId(): Promise<string | null> {
  try {
    return (await requireSession()).playerId
  } catch (err) {
    if (err instanceof Error && err.message === 'unauthorized') return null
    throw err
  }
}

/**
 * Handle a PIN submitted at the gate. On success, issues the signed session
 * cookie for an unclaimed phone. Every other outcome sets nothing.
 */
export async function setPasscode(value: string): Promise<GateStatus> {
  const ip = clientIpFrom(await headers())
  const status = await attemptGate(value.trim(), ip)
  if (status !== 'ok') return status

  // attemptGate returned 'ok', so both are set.
  const keys = { secret: process.env.AUTH_SECRET as string, passcode: process.env.HOUSE_PASSCODE as string }
  await writeCookie(
    { issuedAtMs: Date.now(), playerId: null, inviteVersion: await getInviteVersion() },
    keys,
  )
  return 'ok'
}

/**
 * Handle an invite link. The token is 32 bytes of HMAC output, so it cannot be
 * guessed and deliberately does NOT go through the PIN rate limiter.
 */
export async function enterWithInvite(token: string): Promise<boolean> {
  const keys = secrets()
  const version = await getInviteVersion()
  if (!verifyInviteToken(token, keys.secret, version)) return false
  await writeCookie({ issuedAtMs: Date.now(), playerId: null, inviteVersion: version }, keys)
  return true
}

/** Re-issue this phone's cookie with a different claim. Requires a valid session. */
export async function setClaim(playerId: string | null): Promise<void> {
  const claims = await requireSession()
  await writeCookie({ ...claims, issuedAtMs: Date.now(), playerId }, secrets())
}
