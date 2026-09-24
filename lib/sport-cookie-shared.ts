import { DEFAULT_SPORT, isSport, type Sport } from '@/lib/domain/sport'

/**
 * Which sport a phone is looking at lives in this cookie, not in the URL.
 * `proxy.ts` sets it from a `?sport=` link and redirects to the clean URL, so
 * the root layout (which paints the theme and cannot see search params) and
 * the page always agree. Kept free of `next/headers` so the proxy can use it.
 */
export const SPORT_COOKIE = 'shed-sport'

export const SPORT_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
}

/** Missing or unrecognized falls back to beer die, the same as `parseSport`. */
export function sportFromCookie(value: string | undefined): Sport {
  return isSport(value) ? value : DEFAULT_SPORT
}
