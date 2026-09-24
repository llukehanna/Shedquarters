import { describe, it, expect } from 'vitest'
import { rating, ordinal } from 'openskill'
import {
  computeRatings,
  computeRatingDeltas,
  PROVISIONAL_GAMES,
  MARGIN,
  marginFor,
  type GameRecord,
  type PlayerRating,
} from '@/lib/domain/ratings'

const A = ['a1', 'a2', 'a3']
const B = ['b1', 'b2', 'b3']

function game(ord: number, over: Partial<GameRecord> = {}): GameRecord {
  return {
    ord,
    teamA: A,
    teamB: B,
    winner: 'a',
    scoreA: 21,
    scoreB: 14,
    voided: false,
    ...over,
  }
}

describe('computeRatings', () => {
  it('returns nothing for no games', () => {
    expect(computeRatings([]).size).toBe(0)
  })

  it('rates every player who appeared', () => {
    const r = computeRatings([game(1)])
    expect([...r.keys()].sort()).toEqual([...A, ...B].sort())
  })

  it('ranks the winning side above the losing side', () => {
    const r = computeRatings([game(1)])
    expect(r.get('a1')!.ordinal).toBeGreaterThan(r.get('b1')!.ordinal)
  })

  it('reduces uncertainty as games accumulate', () => {
    const one = computeRatings([game(1)]).get('a1')!
    const many = computeRatings(
      Array.from({ length: 10 }, (_, i) => game(i + 1)),
    ).get('a1')!
    expect(many.sigma).toBeLessThan(one.sigma)
  })

  it('ignores voided games entirely', () => {
    const clean = computeRatings([game(1)])
    const withVoid = computeRatings([game(1), game(2, { voided: true, scoreB: 0 })])
    expect(withVoid.get('a1')!.mu).toBeCloseTo(clean.get('a1')!.mu, 10)
    expect(withVoid.get('a1')!.games).toBe(1)
  })

  it('rewards a blowout more than a nailbiter', () => {
    const close = computeRatings([game(1, { scoreB: 19 })]).get('a1')!
    const blowout = computeRatings([game(1, { scoreB: 4 })]).get('a1')!
    expect(blowout.mu).toBeGreaterThan(close.mu)
  })

  it('treats a within-margin win as an ordinary win', () => {
    const byTwo = computeRatings([game(1, { scoreB: 19 })]).get('a1')!
    const noMargin = computeRatings([game(1, { scoreB: 19 })], { margin: 0 }).get('a1')!
    expect(byTwo.mu).toBeCloseTo(noMargin.mu, 6)
  })

  it('actually applies a margin override: disabling margin weighting understates a blowout', () => {
    // At the default margin (5), a 21-4 blowout (gap 17) is well outside the
    // margin and gets amplified. With { margin: 0 }, openskill skips margin
    // weighting entirely (margin is falsy), so the winner's mu increase is the
    // plain, unamplified update — strictly smaller than the amplified default.
    const defaultMargin = computeRatings([game(1, { scoreB: 4 })]).get('a1')!
    const noMargin = computeRatings([game(1, { scoreB: 4 })], { margin: 0 }).get('a1')!
    expect(noMargin.mu).toBeLessThan(defaultMargin.mu)
  })

  it('ranks the winning side above the losing side on a B-side win', () => {
    const r = computeRatings([game(1, { winner: 'b', scoreA: 14, scoreB: 21 })])
    expect(r.get('b1')!.ordinal).toBeGreaterThan(r.get('a1')!.ordinal)
  })

  it('replays in ord order regardless of input order', () => {
    const games = [game(1, { scoreB: 4 }), game(2, { winner: 'b', scoreA: 9, scoreB: 21 }), game(3)]
    const sorted = computeRatings(games)
    const shuffled = computeRatings([games[2], games[0], games[1]])
    expect(shuffled.get('a1')!.mu).toBeCloseTo(sorted.get('a1')!.mu, 10)
  })

  it('produces identical output for two input orderings of games sharing an ord', () => {
    // ord is documented as required-unique, but the comparator must still be a
    // total order: two callers passing the same rows in a different array
    // order must never see a different ladder because of it.
    const tied = [
      { ...game(1, { scoreB: 4 }), ord: 5 },
      { ...game(2, { winner: 'b' as const, scoreA: 9, scoreB: 21 }), ord: 5 },
    ]
    const forward = computeRatings(tied)
    const reversed = computeRatings([tied[1], tied[0]])
    for (const id of [...A, ...B]) {
      expect(reversed.get(id)!.mu).toBeCloseTo(forward.get(id)!.mu, 10)
      expect(reversed.get(id)!.sigma).toBeCloseTo(forward.get(id)!.sigma, 10)
    }
  })

  it('counts games and wins per player', () => {
    const r = computeRatings([game(1), game(2, { winner: 'b', scoreA: 9, scoreB: 21 })])
    expect(r.get('a1')!.games).toBe(2)
    expect(r.get('a1')!.wins).toBe(1)
    expect(r.get('b1')!.wins).toBe(1)
  })

  it('flags players as provisional below the threshold', () => {
    const few = computeRatings([game(1)])
    expect(few.get('a1')!.provisional).toBe(true)

    const many = computeRatings(
      Array.from({ length: PROVISIONAL_GAMES }, (_, i) => game(i + 1)),
    )
    expect(many.get('a1')!.provisional).toBe(false)
  })

  it('is deterministic', () => {
    const games = [game(1), game(2, { winner: 'b', scoreA: 12, scoreB: 21 })]
    expect(computeRatings(games).get('a1')!.mu).toBe(computeRatings(games).get('a1')!.mu)
  })

  it('throws when the declared winner did not score more', () => {
    // winner: 'a' but B actually scored more.
    expect(() => computeRatings([game(1, { winner: 'a', scoreA: 14, scoreB: 21 })])).toThrow()
  })

  it('throws on a tied score even though a winner is declared', () => {
    expect(() => computeRatings([game(1, { scoreA: 20, scoreB: 20 })])).toThrow()
  })

  it('throws when the same player appears on both teams', () => {
    expect(() =>
      computeRatings([game(1, { teamA: ['a1', 'a2', 'a3'], teamB: ['a1', 'b2', 'b3'] })]),
    ).toThrow()
  })

  it('throws when the same player appears twice on one team', () => {
    expect(() =>
      computeRatings([game(1, { teamA: ['a1', 'a1', 'a3'] })]),
    ).toThrow()
  })

  it('pins its exact output for a fixed history — a characterization test guarding against a change in the replay/delta refactor', () => {
    // Golden values captured from this exact function on this exact input.
    // computeRatingDeltas was split out of computeRatings' old inline replay
    // loop into a shared computeRatingsAndDeltas(); this test exists so that
    // refactor (or any other change to the replay) can't silently change
    // what computeRatings itself returns without a test noticing.
    const games = [
      game(1),
      game(2, { winner: 'b', scoreA: 9, scoreB: 21 }),
      game(3, { scoreB: 7 }),
    ]
    const r = computeRatings(games)

    // Pins the tallies Map's key insertion order too — the only tie-break
    // the stable sort in lib/ratings-cache.ts has for equal ordinals.
    // Insertion order depends on which side (winners vs losers) has its
    // pre-game ordinals captured first inside the replay loop; swapping
    // that order changes this without changing any mu/sigma/ordinal value
    // above, since a1-a3 and b1-b3 are each mutually symmetric here.
    expect([...r.keys()]).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3'])

    expect(r.get('a1')!.mu).toBeCloseTo(29.095108990241066, 10)
    expect(r.get('a1')!.sigma).toBeCloseTo(8.059614135583738, 10)
    expect(r.get('a1')!.ordinal).toBeCloseTo(4.9162665834898505, 10)
    expect(r.get('a1')!.games).toBe(3)
    expect(r.get('a1')!.wins).toBe(2)

    expect(r.get('b1')!.mu).toBeCloseTo(20.904891009758934, 10)
    expect(r.get('b1')!.sigma).toBeCloseTo(8.059614135583738, 10)
    expect(r.get('b1')!.ordinal).toBeCloseTo(-3.273951396992281, 10)
    expect(r.get('b1')!.games).toBe(3)
    expect(r.get('b1')!.wins).toBe(1)
  })
})

describe('computeRatingDeltas', () => {
  it('gives the winning team a positive delta and the losing team a negative one', () => {
    const deltas = computeRatingDeltas([game(1)])
    const d = deltas.get(1)!
    expect(d.winnerDelta).toBeGreaterThan(0)
    expect(d.loserDelta).toBeLessThan(0)
  })

  it('produces a delta for a player\'s very first game, same as any other', () => {
    const deltas = computeRatingDeltas([game(1)])
    expect(deltas.get(1)).toBeDefined()
    expect(deltas.get(1)!.winnerDelta).not.toBe(0)
  })

  it('does not change an earlier game\'s delta when later games are appended', () => {
    const first = computeRatingDeltas([game(1)]).get(1)!
    const withMore = computeRatingDeltas([
      game(1),
      game(2, { winner: 'b', scoreA: 9, scoreB: 21 }),
      game(3),
    ]).get(1)!
    expect(withMore.winnerDelta).toBeCloseTo(first.winnerDelta, 10)
    expect(withMore.loserDelta).toBeCloseTo(first.loserDelta, 10)
  })

  it('gives a voided game no delta at all', () => {
    const deltas = computeRatingDeltas([game(1), game(2, { voided: true, scoreB: 0 })])
    expect(deltas.has(2)).toBe(false)
    expect(deltas.size).toBe(1)
  })

  it('leaves the surrounding games\' deltas unaffected by a voided game between them', () => {
    const withoutVoid = computeRatingDeltas([game(1), game(3)])
    const withVoid = computeRatingDeltas([
      game(1),
      { ...game(2), voided: true, scoreB: 0 },
      game(3),
    ])
    expect(withVoid.get(1)).toEqual(withoutVoid.get(1))
    expect(withVoid.get(3)).toEqual(withoutVoid.get(3))
  })

  it('matches an independent prefix-by-prefix recomputation of the actual ordinal change', () => {
    // The delta for game k is, by definition, how much each side's average
    // ordinal moved across that game's update. This recomputes that
    // completely independently of computeRatingDeltas' own bookkeeping — via
    // two separate computeRatings() calls on the prefixes before and
    // through game k — and checks the two agree, rather than only checking
    // computeRatingDeltas is internally self-consistent.
    const games = [
      game(1),
      game(2, { winner: 'b', scoreA: 9, scoreB: 21 }),
      game(3, { scoreB: 7 }),
    ]
    const defaultOrdinal = ordinal(rating())
    const avgOrdinal = (ratings: Map<string, PlayerRating>, ids: string[]): number => {
      const values = ids.map((id) => ratings.get(id)?.ordinal ?? defaultOrdinal)
      return values.reduce((sum, v) => sum + v, 0) / values.length
    }

    const deltas = computeRatingDeltas(games)

    for (let k = 0; k < games.length; k++) {
      const g = games[k]
      const before = computeRatings(games.slice(0, k))
      const after = computeRatings(games.slice(0, k + 1))
      const winners = g.winner === 'a' ? g.teamA : g.teamB
      const losers = g.winner === 'a' ? g.teamB : g.teamA

      const expectedWinnerDelta = avgOrdinal(after, winners) - avgOrdinal(before, winners)
      const expectedLoserDelta = avgOrdinal(after, losers) - avgOrdinal(before, losers)

      const d = deltas.get(g.ord)!
      expect(d.winnerDelta).toBeCloseTo(expectedWinnerDelta, 10)
      expect(d.loserDelta).toBeCloseTo(expectedLoserDelta, 10)
    }
  })

  it('produces the same delta for a given game regardless of the input array order', () => {
    // Mirrors computeRatings' own "replays in ord order regardless of input
    // order" test, but for computeRatingDeltas specifically.
    const games = [game(1, { scoreB: 4 }), game(2, { winner: 'b', scoreA: 9, scoreB: 21 }), game(3)]
    const inOrder = computeRatingDeltas(games)
    const shuffled = computeRatingDeltas([games[2], games[0], games[1]])

    for (const g of games) {
      expect(shuffled.get(g.ord)!.winnerDelta).toBeCloseTo(inOrder.get(g.ord)!.winnerDelta, 10)
      expect(shuffled.get(g.ord)!.loserDelta).toBeCloseTo(inOrder.get(g.ord)!.loserDelta, 10)
    }
  })

  it('averages a delta across an uneven number of players per team, not a hardcoded divisor', () => {
    // A wrong divisor (e.g. a hardcoded team size) wouldn't flip the sign or
    // produce NaN/Infinity here, so a finiteness-and-sign check alone can't
    // catch it — this pins the actual expected magnitude, computed
    // independently via computeRatings on the same single game and divided
    // by each side's own (2 vs 3) length.
    const uneven: GameRecord = {
      ord: 1,
      teamA: ['x1', 'x2'],
      teamB: ['y1', 'y2', 'y3'],
      winner: 'a',
      scoreA: 21,
      scoreB: 14,
      voided: false,
    }
    const defaultOrdinal = ordinal(rating())
    const after = computeRatings([uneven])
    const expectedWinnerDelta =
      (after.get('x1')!.ordinal + after.get('x2')!.ordinal) / 2 - defaultOrdinal
    const expectedLoserDelta =
      (after.get('y1')!.ordinal + after.get('y2')!.ordinal + after.get('y3')!.ordinal) / 3 -
      defaultOrdinal

    const d = computeRatingDeltas([uneven]).get(1)!
    expect(d.winnerDelta).toBeCloseTo(expectedWinnerDelta, 10)
    expect(d.loserDelta).toBeCloseTo(expectedLoserDelta, 10)
  })

  it('never produces NaN for an empty team, even though nothing in the domain currently produces one', () => {
    const emptyTeam: GameRecord = {
      ord: 1,
      teamA: [],
      teamB: ['b1'],
      winner: 'b',
      scoreA: 5,
      scoreB: 21,
      voided: false,
    }
    const d = computeRatingDeltas([emptyTeam]).get(1)!
    expect(d.loserDelta).toBe(0)
    expect(Number.isNaN(d.loserDelta)).toBe(false)
  })
})

describe('marginFor', () => {
  it('is MARGIN for a game to 21, so beer die ratings are unchanged', () => {
    expect(marginFor(21)).toBe(MARGIN)
    expect(marginFor()).toBe(MARGIN)
  })

  it('scales with the length of the game', () => {
    expect(marginFor(11)).toBe(3)
    expect(marginFor(15)).toBe(4)
    expect(marginFor(25)).toBe(6)
  })
})

describe('computeRatings with per-game targets', () => {
  it('treats the same gap as more lopsided in a shorter game', () => {
    // A 5-point gap: an ordinary win to 21, a clear beating to 11.
    const to21 = computeRatings([game(1, { scoreA: 21, scoreB: 16 })])
    const to11 = computeRatings([game(1, { scoreA: 11, scoreB: 6, targetScore: 11 })])
    expect(to11.get('a1')!.ordinal).toBeGreaterThan(to21.get('a1')!.ordinal)
  })

  it('reads a missing target as 21', () => {
    const implicit = computeRatings([game(1, { scoreA: 21, scoreB: 5 })])
    const explicit = computeRatings([game(1, { scoreA: 21, scoreB: 5, targetScore: 21 })])
    expect(implicit).toEqual(explicit)
  })
})
