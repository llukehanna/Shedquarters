import { describe, expect, it } from 'vitest'
import { computeRatings, type GameRecord } from '@/lib/domain/ratings'
import { headToHeadBoth, playerSportSummary } from '@/lib/domain/player-summary'
import type { GameHistoryEntry } from '@/lib/queries'
import type { Player } from '@/lib/queries'

function g(ord: number, teamA: string[], teamB: string[], winner: 'a' | 'b', scoreA = 21, scoreB = 10): GameHistoryEntry {
  return { ord, teamA, teamB, winner, scoreA, scoreB, voided: false, createdAt: '2026-09-20T02:00:00.000Z' }
}

const player = (id: string, displayName = id): Player => ({ id, displayName, photoUrl: null, isHousemate: true, nicknames: [] })
const NOW = new Date('2026-09-24T12:00:00Z')

/** Best first, the way getRatings() hands them to a page. */
const ranked = (games: GameRecord[]) => [...computeRatings(games).values()].sort((a, b) => b.ordinal - a.ordinal)

// ana plays three die games (wins two) and no spikeball.
const die = [
  g(1, ['ana', 'ben'], ['cal', 'dee'], 'a', 21, 15),
  g(2, ['ana', 'ben'], ['cal', 'dee'], 'b', 12, 21),
  g(3, ['ana', 'cal'], ['ben', 'dee'], 'a', 21, 19),
]
const spike = [g(4, ['ben', 'eli'], ['cal', 'dee'], 'a', 15, 9)]

describe('playerSportSummary', () => {
  it('sums up a sport the player has played', () => {
    const s = playerSportSummary(ranked(die), die, 'ana', NOW)
    expect(s.played).toBe(3)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.winRate).toBeCloseTo(2 / 3)
    expect(s.rank).not.toBeNull()
    expect(s.streak).toEqual({ result: 'W', length: 1 })
    expect(s.diff.total).toBe(6 - 9 + 2)
  })

  it('is empty, not missing, for a sport the player has never played', () => {
    const s = playerSportSummary(ranked(spike), spike, 'ana', NOW)
    expect(s).toMatchObject({ played: 0, wins: 0, losses: 0, winRate: null, rank: null, rating: null, streak: null })
    expect(s.badges).toEqual([])
  })

  it('ignores voided games', () => {
    const withVoid = [...die, { ...g(5, ['ana', 'ben'], ['cal', 'dee'], 'a'), voided: true }]
    expect(playerSportSummary(ranked(withVoid), withVoid, 'ana', NOW).played).toBe(3)
  })
})

describe('headToHeadBoth', () => {
  const players = ['ana', 'ben', 'cal', 'dee', 'eli'].map((id) => player(id))

  it('lists everyone met in either sport, with null for a sport they never met in', () => {
    const rows = headToHeadBoth({ beer_die: die, spikeball: spike }, 'ben', players)
    const eli = rows.find((r) => r.player.id === 'eli')
    // Ben and Eli were teammates in spikeball, never opponents, so no row.
    expect(eli).toBeUndefined()
    const cal = rows.find((r) => r.player.id === 'cal')!
    expect(cal.die).toEqual({ wins: 1, losses: 2 })
    expect(cal.spike).toEqual({ wins: 1, losses: 0 })
  })

  it('puts the opponent with the most games against them, across both sports, first', () => {
    const rows = headToHeadBoth({ beer_die: die, spikeball: spike }, 'ben', players)
    // Cal: three die games against Ben and one spikeball. Dee: two and one.
    expect(rows.map((r) => r.player.id)).toEqual(['cal', 'dee', 'ana'])
  })

  it('leaves a sport null when two players never met in it', () => {
    const rows = headToHeadBoth({ beer_die: die, spikeball: spike }, 'ana', players)
    expect(rows.find((r) => r.player.id === 'cal')).toMatchObject({ die: { wins: 1, losses: 1 }, spike: null })
  })
})
