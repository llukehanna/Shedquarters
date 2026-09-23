import { describe, it, expect } from 'vitest'
import {
  shedOfShame,
  MIN_GAMES_FOR_SHAME,
  MIN_NON_PROVISIONAL_FOR_CURSED,
  MIN_SKID_LENGTH,
  type ShamePlayer,
} from '@/lib/domain/shame'

function player(id: string, over: Partial<ShamePlayer> = {}): ShamePlayer {
  return {
    playerId: id,
    ordinal: 0,
    provisional: false,
    games: 20,
    streak: null,
    differentialTotal: 0,
    ...over,
  }
}

describe('shedOfShame', () => {
  it('returns nothing when nobody qualifies for any slot', () => {
    const players = [player('a'), player('b'), player('c')]
    expect(shedOfShame(players)).toEqual([])
  })

  it('picks the longest active losing streak of at least the minimum length for "skid"', () => {
    const players = [
      player('a', { streak: { result: 'L', length: MIN_SKID_LENGTH } }),
      player('b', { streak: { result: 'L', length: MIN_SKID_LENGTH + 3 } }),
      player('c', { streak: { result: 'W', length: 99 } }), // winning streak never qualifies
    ]
    expect(shedOfShame(players)).toContainEqual({ slot: 'skid', playerId: 'b', streakLength: MIN_SKID_LENGTH + 3 })
  })

  it('excludes a losing streak shorter than the minimum from "skid"', () => {
    const players = [player('a', { streak: { result: 'L', length: MIN_SKID_LENGTH - 1 } })]
    expect(shedOfShame(players).find((e) => e.slot === 'skid')).toBeUndefined()
  })

  it('requires exactly MIN_SKID_LENGTH to be 2 (a one-game losing streak is not a skid)', () => {
    expect(MIN_SKID_LENGTH).toBe(2)
  })

  it('enforces the minimum-games floor on "skid" too: two losses on two games is not enough history', () => {
    const newGuy = player('new', { games: MIN_GAMES_FOR_SHAME - 1, streak: { result: 'L', length: MIN_SKID_LENGTH } })
    expect(shedOfShame([newGuy]).find((e) => e.slot === 'skid')).toBeUndefined()
  })

  it('includes "skid" once the games floor is met', () => {
    const regular = player('regular', { games: MIN_GAMES_FOR_SHAME, streak: { result: 'L', length: MIN_SKID_LENGTH } })
    expect(shedOfShame([regular])).toContainEqual({
      slot: 'skid',
      playerId: 'regular',
      streakLength: MIN_SKID_LENGTH,
    })
  })

  it('breaks a tied streak length in favor of the worse (lower ordinal) player', () => {
    const players = [
      player('better', { ordinal: 10, streak: { result: 'L', length: 4 } }),
      player('worse', { ordinal: -10, streak: { result: 'L', length: 4 } }),
    ]
    expect(shedOfShame(players)).toContainEqual({ slot: 'skid', playerId: 'worse', streakLength: 4 })
  })

  it('picks the most negative point differential among players with the minimum games', () => {
    const players = [
      player('a', { games: MIN_GAMES_FOR_SHAME, differentialTotal: -5 }),
      player('b', { games: MIN_GAMES_FOR_SHAME, differentialTotal: -50 }),
    ]
    expect(shedOfShame(players)).toContainEqual({ slot: 'diff', playerId: 'b', total: -50 })
  })

  it('enforces the minimum-games floor: a single-blowout guest never beats a long-suffering regular', () => {
    const guest = player('guest', { games: MIN_GAMES_FOR_SHAME - 1, differentialTotal: -21 })
    const regular = player('regular', { games: 40, differentialTotal: -15 })
    expect(shedOfShame([guest, regular])).toContainEqual({ slot: 'diff', playerId: 'regular', total: -15 })
  })

  it('omits "diff" entirely if the only candidates fall below the games floor', () => {
    const players = [player('guest', { games: 1, differentialTotal: -21 })]
    expect(shedOfShame(players).find((e) => e.slot === 'diff')).toBeUndefined()
  })

  it('requires exactly MIN_GAMES_FOR_SHAME to be 5', () => {
    expect(MIN_GAMES_FOR_SHAME).toBe(5)
  })

  it('omits "diff" if nobody is actually outscored (best differential is non-negative)', () => {
    const players = [player('a', { games: 40, differentialTotal: 0 }), player('b', { games: 40, differentialTotal: 12 })]
    expect(shedOfShame(players).find((e) => e.slot === 'diff')).toBeUndefined()
  })

  it('breaks a tied differential in favor of the worse (lower ordinal) player', () => {
    const players = [
      player('better', { ordinal: 10, games: 40, differentialTotal: -30 }),
      player('worse', { ordinal: -10, games: 40, differentialTotal: -30 }),
    ]
    expect(shedOfShame(players)).toContainEqual({ slot: 'diff', playerId: 'worse', total: -30 })
  })

  it('omits "cursed" with only one non-provisional player', () => {
    const players = [
      player('a', { provisional: false, ordinal: -20 }),
      player('b', { provisional: true, ordinal: -30 }),
      player('c', { provisional: true, ordinal: -40 }),
    ]
    expect(shedOfShame(players).find((e) => e.slot === 'cursed')).toBeUndefined()
  })

  it('omits "cursed" with exactly three non-provisional players', () => {
    const players = [
      player('a', { provisional: false, ordinal: 10 }),
      player('b', { provisional: false, ordinal: 0 }),
      player('c', { provisional: false, ordinal: -10 }),
      player('d', { provisional: true, ordinal: -99 }),
    ]
    expect(shedOfShame(players).find((e) => e.slot === 'cursed')).toBeUndefined()
  })

  it('includes "cursed" once there are at least four non-provisional players, picking the lowest ordinal', () => {
    const players = [
      player('a', { provisional: false, ordinal: 10 }),
      player('b', { provisional: false, ordinal: 0 }),
      player('c', { provisional: false, ordinal: -10 }),
      player('d', { provisional: false, ordinal: -20 }),
      player('e', { provisional: true, ordinal: -99 }), // provisional "worst" never qualifies
    ]
    expect(shedOfShame(players)).toContainEqual({ slot: 'cursed', playerId: 'd', ordinal: -20 })
  })

  it('requires exactly MIN_NON_PROVISIONAL_FOR_CURSED to be 4 (the field-vs-accident line)', () => {
    expect(MIN_NON_PROVISIONAL_FOR_CURSED).toBe(4)
  })

  it('dedupes: a player who is worst on every metric only fills the highest-priority slot, and the rest fall through', () => {
    const goat = player('goat', {
      ordinal: -100,
      provisional: false,
      games: 40,
      streak: { result: 'L', length: 10 },
      differentialTotal: -500,
    })
    const secondSkid = player('second-skid', { streak: { result: 'L', length: 5 }, provisional: false, ordinal: -5 })
    const secondDiff = player('second-diff', { games: 40, differentialTotal: -100, provisional: false, ordinal: -4 })
    const filler1 = player('filler1', { provisional: false, ordinal: -3 })
    const filler2 = player('filler2', { provisional: false, ordinal: -2 })

    const entries = shedOfShame([goat, secondSkid, secondDiff, filler1, filler2])

    // goat wins skid outright (priority order: skid first).
    expect(entries).toContainEqual({ slot: 'skid', playerId: 'goat', streakLength: 10 })
    // diff and cursed must fall through to the next-worst eligible player,
    // not be dropped, and must not re-select goat.
    const diffEntry = entries.find((e) => e.slot === 'diff')
    const cursedEntry = entries.find((e) => e.slot === 'cursed')
    expect(diffEntry).toBeDefined()
    expect(diffEntry!.playerId).not.toBe('goat')
    expect(diffEntry).toEqual({ slot: 'diff', playerId: 'second-diff', total: -100 })
    expect(cursedEntry).toBeDefined()
    expect(cursedEntry!.playerId).not.toBe('goat')
    // Every entry names a distinct player.
    const names = entries.map((e) => e.playerId)
    expect(new Set(names).size).toBe(names.length)
  })

  it('falls through to the next-worst eligible player when the worst is already taken, rather than dropping the slot', () => {
    // 'worst' is both the longest skid AND the worst differential.
    const worst = player('worst', { streak: { result: 'L', length: 8 }, games: 40, differentialTotal: -200 })
    const nextWorstDiff = player('next', { games: 40, differentialTotal: -50 })
    const entries = shedOfShame([worst, nextWorstDiff])
    expect(entries).toContainEqual({ slot: 'skid', playerId: 'worst', streakLength: 8 })
    expect(entries).toContainEqual({ slot: 'diff', playerId: 'next', total: -50 })
  })

  it('produces all three entries independently when three different players qualify', () => {
    const players = [
      player('skidder', { streak: { result: 'L', length: 6 }, provisional: false, ordinal: 5 }),
      player('sunk', { games: 40, differentialTotal: -80, provisional: false, ordinal: 3 }),
      player('worst-rated', { provisional: false, ordinal: -50, games: 40 }),
      player('filler', { provisional: false, ordinal: 1, games: 40 }),
    ]
    const entries = shedOfShame(players)
    expect(entries).toEqual(
      expect.arrayContaining([
        { slot: 'skid', playerId: 'skidder', streakLength: 6 },
        { slot: 'diff', playerId: 'sunk', total: -80 },
        { slot: 'cursed', playerId: 'worst-rated', ordinal: -50 },
      ]),
    )
    expect(entries).toHaveLength(3)
  })
})
