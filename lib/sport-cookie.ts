import { cookies } from 'next/headers'
import type { Sport } from '@/lib/domain/sport'
import { SPORT_COOKIE, sportFromCookie } from '@/lib/sport-cookie-shared'

export { SPORT_COOKIE, SPORT_COOKIE_OPTIONS, sportFromCookie } from '@/lib/sport-cookie-shared'

/** Which sport this phone is looking at. Server components only. */
export async function currentSport(): Promise<Sport> {
  return sportFromCookie((await cookies()).get(SPORT_COOKIE)?.value)
}
