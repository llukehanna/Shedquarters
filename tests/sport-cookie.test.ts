import { describe, expect, it } from 'vitest'
import { SPORT_COOKIE, sportFromCookie } from '@/lib/sport-cookie-shared'

describe('sportFromCookie', () => {
  it('reads a known sport', () => expect(sportFromCookie('spikeball')).toBe('spikeball'))
  it('falls back to beer die when the cookie is missing', () => expect(sportFromCookie(undefined)).toBe('beer_die'))
  it('falls back to beer die on a value it does not know', () => expect(sportFromCookie('darts')).toBe('beer_die'))
  it('is called shed-sport', () => expect(SPORT_COOKIE).toBe('shed-sport'))
})
