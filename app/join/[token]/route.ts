import { NextResponse } from 'next/server'
import { enterWithInvite } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * The house invite link. The token is 32 bytes of HMAC output, so it is not a
 * guessing surface and does not touch the PIN rate limiter. A token from a
 * previous invite version is treated exactly like a malformed one: the visitor
 * is sent to the gate with an explanation, and no cookie is set.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ok = await enterWithInvite(token)
  return NextResponse.redirect(new URL(ok ? '/who' : '/gate?invite=stale', req.url), 307)
}
