import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPORT,
  SPORT_RULES,
  isSport,
  isValidTarget,
  isValidTeamSize,
  parseSport,
  withSport,
} from '@/lib/domain/sport'

describe('SPORT_RULES', () => {
  it('plays spikeball to 25, 15 or 11, two a side', () => {
    expect(SPORT_RULES.spikeball.targets).toEqual([25, 15, 11])
    expect(SPORT_RULES.spikeball.targets).toContain(SPORT_RULES.spikeball.defaultTarget)
    expect(SPORT_RULES.spikeball.teamSizes).toEqual([2])
  })

  it('leaves beer die exactly as it was: to 21, 3v3 or 2v2', () => {
    expect(SPORT_RULES.beer_die.targets).toEqual([21])
    expect(SPORT_RULES.beer_die.defaultTarget).toBe(21)
    expect(SPORT_RULES.beer_die.teamSizes).toEqual([3, 2])
    expect(DEFAULT_SPORT).toBe('beer_die')
  })
})

describe('parseSport', () => {
  it('reads a known sport', () => {
    expect(parseSport('spikeball')).toBe('spikeball')
    expect(parseSport('beer_die')).toBe('beer_die')
  })

  it('takes the first of a repeated param', () => {
    expect(parseSport(['spikeball', 'beer_die'])).toBe('spikeball')
  })

  it('falls back to beer die for anything else', () => {
    expect(parseSport(undefined)).toBe('beer_die')
    expect(parseSport('')).toBe('beer_die')
    expect(parseSport('Spikeball')).toBe('beer_die')
    expect(parseSport('cornhole')).toBe('beer_die')
  })
})

describe('isSport', () => {
  it('accepts only the stored values', () => {
    expect(isSport('spikeball')).toBe(true)
    expect(isSport('beer_die')).toBe(true)
    expect(isSport('beer die')).toBe(false)
    expect(isSport(null)).toBe(false)
  })
})

describe('isValidTarget', () => {
  it('allows only the targets each sport is played to', () => {
    for (const t of [25, 15, 11]) expect(isValidTarget('spikeball', t)).toBe(true)
    expect(isValidTarget('spikeball', 21)).toBe(false)
    expect(isValidTarget('beer_die', 21)).toBe(true)
    expect(isValidTarget('beer_die', 15)).toBe(false)
  })

  it('rejects anything that is not a number', () => {
    expect(isValidTarget('spikeball', '15')).toBe(false)
    expect(isValidTarget('spikeball', null)).toBe(false)
  })
})

describe('isValidTeamSize', () => {
  it('holds spikeball to 2v2', () => {
    expect(isValidTeamSize('spikeball', 2)).toBe(true)
    expect(isValidTeamSize('spikeball', 3)).toBe(false)
    expect(isValidTeamSize('beer_die', 3)).toBe(true)
    expect(isValidTeamSize('beer_die', 2)).toBe(true)
    expect(isValidTeamSize('beer_die', 4)).toBe(false)
  })
})

describe('withSport', () => {
  it('leaves beer die URLs exactly as they were', () => {
    expect(withSport('/', 'beer_die')).toBe('/')
    expect(withSport('/h2h?a=p1', 'beer_die')).toBe('/h2h?a=p1')
  })

  it('adds the sport as a query param, keeping any already there', () => {
    expect(withSport('/', 'spikeball')).toBe('/?sport=spikeball')
    expect(withSport('/players/p1', 'spikeball')).toBe('/players/p1?sport=spikeball')
    expect(withSport('/h2h?a=p1', 'spikeball')).toBe('/h2h?a=p1&sport=spikeball')
  })
})
