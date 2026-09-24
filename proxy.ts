import { NextResponse, type NextRequest } from 'next/server'
import { parseSport } from '@/lib/domain/sport'
import { SPORT_COOKIE, SPORT_COOKIE_OPTIONS } from '@/lib/sport-cookie-shared'

/**
 * A `?sport=` link is how a phone switches sport: remember it in the cookie
 * and send the phone to the same page without it. After this, the cookie is
 * the only place the sport lives. Links shared before the switch moved to the
 * top bar still land on the right ladder.
 */
export function proxy(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('sport')
  if (raw === null) return NextResponse.next()

  const clean = request.nextUrl.clone()
  clean.searchParams.delete('sport')
  const res = NextResponse.redirect(clean, 307)
  res.cookies.set(SPORT_COOKIE, parseSport(raw), SPORT_COOKIE_OPTIONS)
  return res
}

export const config = {
  // Pages only: not the API, Next's own files, or anything with an extension
  // (the manifest, the service worker, icons).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
