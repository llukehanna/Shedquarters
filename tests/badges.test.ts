import { describe, it, expect } from 'vitest'
import { earnedBadges, earnedBadgesFromLive, GHOST_DAYS } from '@/lib/domain/badges'
import { liveGames } from '@/lib/domain/stats'
import { PROVISIONAL_GAMES } from '@/lib/domain/ratings'
import { TARGET_SCORE } from '@/lib/domain/score'
import type { GameHistoryEntry } from '@/lib/queries'

const ME = 'me'
const THEM = 'them'

/** A fixed "now" well clear of any DST edge, so nothing here depends on today. */
const NOW = new Date('2026-06-15T20:00:00.000Z')

let nextOrd = 1

/**
 * One game. `daysAgo` is measured back from NOW in whole 24h steps, which is
 * only ever used to build fixtures — the code under test does its own
 * zone-pinned day counting, which the "Shed time" block below exercises with
 * explicit timestamps instead.
 */
function game(over: Partial<GameHistoryEntry> & { daysAgo?: number } = {}): GameHistoryEntry {
  const { daysAgo = 0, ...rest } = over
  return {
    ord: nextOrd++,
    createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    teamA: [ME],
    teamB: [THEM],
    winner: 'a',
    scoreA: TARGET_SCORE,
    scoreB: 12,
    voided: false,
    ...rest,
  }
}

const kinds = (games: GameHistoryEntry[], now: Date = NOW) =>
  earnedBadges(games, ME, now).map((b) => b.kind)
const badge = (games: GameHistoryEntry[], kind: string, now: Date = NOW) =>
  earnedBadges(games, ME, now).find((b) => b.kind === kind)

/** Enough recent, unremarkable wins to clear the Rookie threshold. */
function seasonOfGames(n = PROVISIONAL_GAMES): GameHistoryEntry[] {
  return Array.from({ length: n }, () => game({ scoreB: 14 }))
}

describe('earnedBadges', () => {
  it('gives a player with a full, unremarkable season no badges at all', () => {
    expect(earnedBadges(seasonOfGames(), ME, NOW)).toEqual([])
  })

  it('ignores games the player was not in', () => {
    const others = Array.from({ length: 30 }, () =>
      game({ teamA: ['a'], teamB: ['b'], scoreB: 0, daysAgo: 100 }),
    )
    // Not their skunk, not their absence — but they have played no games, so
    // Rookie (and only Rookie) applies.
    expect(kinds(others)).toEqual(['rookie'])
  })
})

describe('earnedBadgesFromLive', () => {
  it('agrees with earnedBadges when handed the same history, pre-sorted', () => {
    const games = [
      ...seasonOfGames(4),
      game({ scoreB: 0 }),
      game({ scoreA: 22, scoreB: 20 }),
      game({ voided: true, scoreB: 0 }),
    ]
    expect(earnedBadgesFromLive(liveGames(games), ME, NOW)).toEqual(earnedBadges(games, ME, NOW))
  })

  it('does not re-sort or re-filter what it was given', () => {
    // Handed a list that still contains a voided game, it trusts the caller
    // and counts it — which is exactly why earnedBadges() is the entry point
    // callers without a pre-sorted list must use.
    const shutout = game({ scoreB: 0, voided: true })
    expect(earnedBadgesFromLive([shutout], ME, NOW).map((b) => b.kind)).toContain('skunk')
    expect(kinds([shutout])).not.toContain('skunk')
  })
})

describe('Skunk', () => {
  it('is earned by winning a game the losing team finished on zero', () => {
    expect(kinds([...seasonOfGames(), game({ scoreB: 0 })])).toContain('skunk')
  })

  it('is not earned by losing one', () => {
    const shutOut = game({ winner: 'b', scoreA: 0, scoreB: TARGET_SCORE })
    expect(kinds([...seasonOfGames(), shutOut])).not.toContain('skunk')
  })

  it('is not earned by a merely lopsided win', () => {
    expect(kinds([...seasonOfGames(), game({ scoreB: 1 })])).not.toContain('skunk')
  })

  it('counts every skunk, not just the first', () => {
    const games = [...seasonOfGames(), game({ scoreB: 0 }), game({ scoreB: 0 }), game({ scoreB: 0 })]
    expect(badge(games, 'skunk')).toEqual({ kind: 'skunk', count: 3 })
  })

  it('reads the losing score from the right side when the player is on team B', () => {
    const asB = game({ teamA: [THEM], teamB: [ME], winner: 'b', scoreA: 0, scoreB: TARGET_SCORE })
    expect(badge([...seasonOfGames(), asB], 'skunk')).toEqual({ kind: 'skunk', count: 1 })
  })

  it('does not count a voided shutout', () => {
    expect(kinds([...seasonOfGames(), game({ scoreB: 0, voided: true })])).not.toContain('skunk')
  })
})

describe('Heartbreaker', () => {
  it('is earned by winning past the target by exactly two', () => {
    const deuce = game({ scoreA: 22, scoreB: 20 })
    expect(badge([...seasonOfGames(), deuce], 'heartbreaker')).toEqual({
      kind: 'heartbreaker',
      count: 1,
    })
  })

  it('is earned deep into deuce, not just at 22–20', () => {
    const marathon = game({ scoreA: 31, scoreB: 29 })
    expect(kinds([...seasonOfGames(), marathon])).toContain('heartbreaker')
  })

  it('is not earned by a win that ended at the target', () => {
    expect(kinds([...seasonOfGames(), game({ scoreA: TARGET_SCORE, scoreB: 19 })])).not.toContain(
      'heartbreaker',
    )
  })

  it('is not earned by losing a deuce game — that is the other guy’s badge', () => {
    const lost = game({ winner: 'b', scoreA: 20, scoreB: 22 })
    expect(kinds([...seasonOfGames(), lost])).not.toContain('heartbreaker')
  })

  it('rejects a past-target win by more than two, which no legal game produces', () => {
    const impossible = game({ scoreA: 30, scoreB: 10 })
    expect(kinds([...seasonOfGames(), impossible])).not.toContain('heartbreaker')
  })

  it('counts every deuce win', () => {
    const games = [...seasonOfGames(), game({ scoreA: 22, scoreB: 20 }), game({ scoreA: 25, scoreB: 23 })]
    expect(badge(games, 'heartbreaker')).toEqual({ kind: 'heartbreaker', count: 2 })
  })

  it('does not count a voided deuce win', () => {
    expect(kinds([...seasonOfGames(), game({ scoreA: 22, scoreB: 20, voided: true })])).not.toContain(
      'heartbreaker',
    )
  })
})

describe('Rookie', () => {
  it('is worn one game short of the provisional line', () => {
    expect(kinds(seasonOfGames(PROVISIONAL_GAMES - 1))).toContain('rookie')
  })

  it('comes off exactly at the provisional line', () => {
    expect(kinds(seasonOfGames(PROVISIONAL_GAMES))).not.toContain('rookie')
  })

  it('stays off well past it', () => {
    expect(kinds(seasonOfGames(PROVISIONAL_GAMES + 20))).not.toContain('rookie')
  })

  it('uses the same threshold the ratings call provisional, not one of its own', () => {
    // If badges.ts ever redefined the line, one of these two would break.
    expect(kinds(seasonOfGames(PROVISIONAL_GAMES - 1))).toContain('rookie')
    expect(kinds(seasonOfGames(PROVISIONAL_GAMES))).not.toContain('rookie')
  })

  it('counts voided games as never played, so a voided game can put a player back in it', () => {
    const season = seasonOfGames(PROVISIONAL_GAMES - 1)
    expect(kinds([...season, game({ voided: true })])).toContain('rookie')
    expect(kinds([...season, game({})])).not.toContain('rookie')
  })

  it('carries no count — you are a rookie or you are not', () => {
    expect(badge(seasonOfGames(2), 'rookie')).toEqual({ kind: 'rookie', count: null })
  })
})

describe('Ghost', () => {
  it('is not worn by someone who played today', () => {
    expect(kinds(seasonOfGames())).not.toContain('ghost')
  })

  it('is not worn one day short of the threshold', () => {
    const stale = Array.from({ length: PROVISIONAL_GAMES }, () =>
      game({ daysAgo: GHOST_DAYS - 1, scoreB: 14 }),
    )
    expect(kinds(stale)).not.toContain('ghost')
  })

  it('is worn exactly at the threshold', () => {
    const stale = Array.from({ length: PROVISIONAL_GAMES }, () =>
      game({ daysAgo: GHOST_DAYS, scoreB: 14 }),
    )
    expect(badge(stale, 'ghost')).toEqual({ kind: 'ghost', count: null })
  })

  it('is worn long after it', () => {
    const gone = Array.from({ length: PROVISIONAL_GAMES }, () => game({ daysAgo: 400, scoreB: 14 }))
    expect(kinds(gone)).toContain('ghost')
  })

  it('is never worn by someone who has never played', () => {
    expect(kinds([])).not.toContain('ghost')
    expect(kinds([game({ teamA: ['a'], teamB: ['b'], daysAgo: 999 })])).not.toContain('ghost')
  })

  it('measures from the most recent game, not the oldest', () => {
    const games = [
      ...Array.from({ length: PROVISIONAL_GAMES }, () => game({ daysAgo: 400, scoreB: 14 })),
      game({ daysAgo: 1, scoreB: 14 }),
    ]
    expect(kinds(games)).not.toContain('ghost')
  })

  it('trusts ord, not created_at, for which game is the most recent', () => {
    // A row with a wildly wrong timestamp but a lower ord must not be taken
    // for the latest game. The highest ord here is the long-ago one, so the
    // player is a ghost despite a "recent"-looking createdAt on an older row.
    const long = Array.from({ length: PROVISIONAL_GAMES }, () => game({ daysAgo: 400, scoreB: 14 }))
    const bogusRecentButOlder: GameHistoryEntry = {
      ...game({ daysAgo: 0, scoreB: 14 }),
      ord: 0, // older than everything above
    }
    expect(kinds([bogusRecentButOlder, ...long])).toContain('ghost')
  })

  it('ignores voided games when deciding how long it has been', () => {
    const games = [
      ...Array.from({ length: PROVISIONAL_GAMES }, () => game({ daysAgo: 400, scoreB: 14 })),
      game({ daysAgo: 0, scoreB: 14, voided: true }),
    ]
    expect(kinds(games)).toContain('ghost')
  })
})

/**
 * These drive the zone-pinned day counting through `earnedBadges` with
 * explicit timestamps on both sides, rather than through an exported helper
 * that only the tests would use. Each case is chosen so that counting in UTC
 * — or by naive 24h arithmetic — gives the opposite answer.
 */
describe('Ghost counts days in Shed time', () => {
  const lastGameAt = (iso: string): GameHistoryEntry[] => [game({ createdAt: iso })]

  it('credits a game to the night it was played, not the UTC date it rolled into', () => {
    // 23:00 PDT on 25 May is 06:00 UTC on 26 May. Counted in Shed time the
    // player last played on the 25th — exactly GHOST_DAYS before 15 June —
    // so the badge is due. Counted in UTC it would be 20 days and not due.
    const games = lastGameAt('2026-05-26T06:00:00.000Z')
    const now = new Date('2026-06-15T20:00:00.000Z') // 13:00 PDT, 15 June
    expect(kinds(games, now)).toContain('ghost')
  })

  it('reads the clock the same way for "now", so a late reader is not aged a day', () => {
    // Somebody opening their profile at 23:00 PDT on 15 June is still in the
    // Shed's 15 June, 20 days after a game on 26 May — not yet a ghost. In
    // UTC "now" would be 16 June and the badge would appear a day early.
    const games = lastGameAt('2026-05-26T20:00:00.000Z') // 13:00 PDT, 26 May
    const now = new Date('2026-06-16T06:00:00.000Z') // 23:00 PDT, 15 June
    expect(kinds(games, now)).not.toContain('ghost')
  })

  it('counts calendar days across a DST change, not 24-hour blocks', () => {
    // 20 Feb to 13 Mar is 21 calendar days, but only 20 days and 23 hours of
    // elapsed time, because the clocks went forward on 8 March. Dividing
    // milliseconds would floor that to 20 and withhold the badge.
    const games = lastGameAt('2026-02-20T20:00:00.000Z') // 12:00 PST, 20 Feb
    const now = new Date('2026-03-13T19:00:00.000Z') // 12:00 PDT, 13 Mar
    expect(now.getTime() - new Date(games[0].createdAt).getTime()).toBeLessThan(
      GHOST_DAYS * 86_400_000,
    )
    expect(kinds(games, now)).toContain('ghost')
  })
})

describe('badge order', () => {
  it('lists the earned-at-the-table badges before the standing ones', () => {
    const games = [game({ scoreB: 0 }), game({ scoreA: 22, scoreB: 20, daysAgo: GHOST_DAYS })]
    expect(kinds(games)).toEqual(['skunk', 'heartbreaker', 'rookie', 'ghost'])
  })

  it('pins GHOST_DAYS to 21 — the number the game is played to', () => {
    expect(GHOST_DAYS).toBe(21)
  })
})

describe('earnedBadges for games to other targets', () => {
  it('counts a spikeball deuce win as a heartbreaker', () => {
    const b = badge([...seasonOfGames(), game({ scoreA: 17, scoreB: 15, targetScore: 15 })], 'heartbreaker')
    expect(b).toEqual({ kind: 'heartbreaker', count: 1 })
  })

  it('does not count a win that reached the target outright', () => {
    expect(kinds([...seasonOfGames(), game({ scoreA: 11, scoreB: 9, targetScore: 11 })])).not.toContain(
      'heartbreaker',
    )
  })

  it('awards a skunk in any game', () => {
    expect(badge([...seasonOfGames(), game({ scoreA: 11, scoreB: 0, targetScore: 11 })], 'skunk')).toEqual({
      kind: 'skunk',
      count: 1,
    })
  })
})
