import { describe, it, expect } from 'vitest'
import {
  longestRuns,
  mostCarried,
  headToHead,
  pointDifferential,
  pointDifferentialFromLive,
  currentStreak,
  currentStreakFromLive,
  liveGames,
  sameTeamGames,
  headToHeadSummary,
  headToHeadNote,
  H2H_MEANINGFUL_GAMES,
} from '@/lib/domain/stats'
import type { GameRecord } from '@/lib/domain/ratings'

function g(ord: number, teamA: string[], teamB: string[], winner: 'a' | 'b'): GameRecord {
  return { ord, teamA, teamB, winner, scoreA: 21, scoreB: 10, voided: false }
}

// Explicit-score variant for point-differential tests, which care about the
// actual margin rather than just who won.
function gs(
  ord: number,
  teamA: string[],
  scoreA: number,
  teamB: string[],
  scoreB: number,
  opts: { voided?: boolean } = {},
): GameRecord {
  return {
    ord,
    teamA,
    teamB,
    winner: scoreA >= scoreB ? 'a' : 'b',
    scoreA,
    scoreB,
    voided: opts.voided ?? false,
  }
}

const X = ['x1', 'x2', 'x3']
const Y = ['y1', 'y2', 'y3']
const Z = ['z1', 'z2', 'z3']

describe('longestRuns', () => {
  it('counts consecutive holds by the same roster', () => {
    const runs = longestRuns([g(1, X, Y, 'a'), g(2, X, Z, 'a'), g(3, X, Y, 'b')])
    expect(runs[0].length).toBe(2)
    expect(runs[0].roster.sort()).toEqual([...X].sort())
  })

  it('starts a new run when the challengers take the table', () => {
    // Two consecutive takeovers (X -> Y, then Y -> Z) must produce two
    // separate length-1 runs, not merge into one. (Brief's original draft
    // had game 2's winner as 'a', which — per the stated domain rule that
    // an 'a' result extends the current holding roster's run — would
    // instead correctly yield a single continuous run of length 2 for Y
    // (took over, then defended). Corrected to 'b' so this test actually
    // exercises "a new run starts when the challengers take the table",
    // as its own description says.)
    const runs = longestRuns([g(1, X, Y, 'b'), g(2, Y, Z, 'b')])
    expect(runs.map((r) => r.length).sort()).toEqual([1, 1])
  })

  it('ignores voided games', () => {
    const games = [g(1, X, Y, 'a'), { ...g(2, X, Z, 'a'), voided: true }]
    expect(longestRuns(games)[0].length).toBe(1)
  })

  it('extends the run when the new holder defends after taking the table', () => {
    // Y takes the table from X (winner 'b' on game 1, seeding current.roster
    // from teamB), then Y defends as the new holder (winner 'a' on game 2,
    // teamA === Y). Per the stated domain rule this is ONE continuous run of
    // length 2 for Y, not two separate takeovers. This is the branch where
    // current.roster is seeded from teamB rather than teamA — distinct from
    // the "starts a new run" test above, which covers two different-roster
    // takeovers in a row.
    const runs = longestRuns([g(1, X, Y, 'b'), g(2, Y, Z, 'a')])
    expect(runs).toHaveLength(1)
    expect(runs[0].length).toBe(2)
    expect(runs[0].roster.sort()).toEqual([...Y].sort())
  })

  it('merges a run across a voided game in the middle', () => {
    // The existing "ignores voided games" test has the voided game trailing,
    // so it never exercises merging two live holds across a void sitting
    // between them. Both live games here are holds by the same roster (X),
    // separated by a voided game — this must collapse to one run of length
    // 2, not two runs of length 1.
    const games = [g(1, X, Y, 'a'), { ...g(2, X, Z, 'a'), voided: true }, g(3, X, Y, 'a')]
    const runs = longestRuns(games)
    expect(runs).toHaveLength(1)
    expect(runs[0].length).toBe(2)
    expect(runs[0].roster.sort()).toEqual([...X].sort())
  })
})

describe('mostCarried', () => {
  it('reports a positive delta when a player wins more with a teammate', () => {
    const games = [
      g(1, ['p', 'carrier', 'c'], Y, 'a'),
      g(2, ['p', 'carrier', 'c'], Z, 'a'),
      g(3, ['p', 'other', 'c'], Y, 'b'),
      g(4, ['p', 'other', 'c'], Z, 'b'),
    ]
    const rec = mostCarried(games, 1).find((r) => r.playerId === 'p' && r.teammateId === 'carrier')
    expect(rec).toBeDefined()
    expect(rec!.withRate).toBe(1)
    expect(rec!.withoutRate).toBe(0)
    expect(rec!.delta).toBe(1)
  })

  it('drops pairs below the minimum sample on either side', () => {
    const games = [g(1, ['p', 'q', 'c'], Y, 'a')]
    expect(mostCarried(games, 2)).toEqual([])
  })
})

describe('headToHead', () => {
  it('counts only games on opposing teams', () => {
    const games = [
      g(1, ['a', 'x', 'y'], ['b', 'w', 'v'], 'a'),
      g(2, ['a', 'x', 'y'], ['b', 'w', 'v'], 'b'),
      g(3, ['a', 'b', 'y'], Z, 'a'),
    ]
    expect(headToHead(games, 'a', 'b')).toEqual({ wins: 1, losses: 1 })
  })
})

describe('sameTeamGames', () => {
  it('counts games where two players are on the same team', () => {
    const games = [
      g(1, ['a', 'b', 'x'], Y, 'a'),
      g(2, ['a', 'b', 'x'], Z, 'b'),
      g(3, ['a', 'c', 'x'], Y, 'a'),
    ]
    expect(sameTeamGames(games, 'a', 'b')).toBe(2)
  })

  it('does not count games where they were opponents', () => {
    const games = [g(1, ['a', 'x', 'y'], ['b', 'w', 'v'], 'a')]
    expect(sameTeamGames(games, 'a', 'b')).toBe(0)
  })

  it('ignores voided games', () => {
    const games = [{ ...g(1, ['a', 'b', 'x'], Y, 'a'), voided: true }]
    expect(sameTeamGames(games, 'a', 'b')).toBe(0)
  })

  it('is zero when the two never appeared together at all', () => {
    expect(sameTeamGames([g(1, X, Y, 'a')], 'p', 'q')).toBe(0)
  })
})

describe('headToHeadSummary', () => {
  it('matches headToHead and sameTeamGames run separately, from one walk', () => {
    const games = [
      g(1, ['a', 'x', 'y'], ['b', 'w', 'v'], 'a'),
      g(2, ['a', 'x', 'y'], ['b', 'w', 'v'], 'b'),
      g(3, ['a', 'b', 'y'], Z, 'a'),
      g(4, ['a', 'b', 'y'], Z, 'b'),
    ]
    const summary = headToHeadSummary(games, 'a', 'b')
    const record = headToHead(games, 'a', 'b')
    const same = sameTeamGames(games, 'a', 'b')

    expect(summary).toEqual({ wins: record.wins, losses: record.losses, sameTeam: same })
    expect(summary).toEqual({ wins: 1, losses: 1, sameTeam: 2 })
  })

  it('is all zero when the two never appeared together at all', () => {
    expect(headToHeadSummary([g(1, X, Y, 'a')], 'p', 'q')).toEqual({ wins: 0, losses: 0, sameTeam: 0 })
  })
})

describe('headToHeadNote', () => {
  it('says plainly when they have never played each other', () => {
    expect(headToHeadNote(0)).toBe("They haven't played each other yet.")
  })

  it('spells out a small count and calls it a coin flip, not a rivalry', () => {
    expect(headToHeadNote(3)).toBe("Three games. That's a coin flip, not a rivalry.")
  })

  it('uses the singular noun for exactly one game', () => {
    expect(headToHeadNote(1)).toBe("One game. That's a coin flip, not a rivalry.")
  })

  it('says nothing once the sample is large enough to mean something', () => {
    expect(headToHeadNote(H2H_MEANINGFUL_GAMES)).toBeNull()
    expect(headToHeadNote(20)).toBeNull()
  })

  it('is a caveat right up to the meaningful threshold', () => {
    expect(headToHeadNote(H2H_MEANINGFUL_GAMES - 1)).not.toBeNull()
  })
})

describe('pointDifferential', () => {
  it('sums a positive margin for a player who only wins', () => {
    const games = [
      gs(1, ['p', 'x2', 'x3'], 21, Y, 10),
      gs(2, ['p', 'x2', 'x3'], 21, Z, 15),
    ]
    const rec = pointDifferential(games, 'p')
    expect(rec.total).toBe(17) // (21-10) + (21-15)
    expect(rec.average).toBe(8.5)
  })

  it('sums a negative margin for a player who only loses', () => {
    const games = [
      gs(1, ['p', 'x2', 'x3'], 10, Y, 21),
      gs(2, ['p', 'x2', 'x3'], 15, Z, 21),
    ]
    const rec = pointDifferential(games, 'p')
    expect(rec.total).toBe(-17) // (10-21) + (15-21)
    expect(rec.average).toBe(-8.5)
  })

  it('nets a mix of wins and losses', () => {
    const games = [
      gs(1, ['p', 'x2', 'x3'], 21, Y, 10), // +11
      gs(2, ['p', 'x2', 'x3'], 12, Z, 21), // -9
    ]
    const rec = pointDifferential(games, 'p')
    expect(rec.total).toBe(2)
    expect(rec.average).toBe(1)
  })

  it('excludes voided games', () => {
    const games = [
      gs(1, ['p', 'x2', 'x3'], 21, Y, 10), // +11, counted
      gs(2, ['p', 'x2', 'x3'], 21, Z, 0, { voided: true }), // ignored
    ]
    const rec = pointDifferential(games, 'p')
    expect(rec.total).toBe(11)
  })

  it('excludes games the player did not appear in', () => {
    const games = [
      gs(1, ['p', 'x2', 'x3'], 21, Y, 10),
      gs(2, X, 21, Y, 5), // p not in this game
    ]
    const rec = pointDifferential(games, 'p')
    expect(rec.total).toBe(11)
  })

  it('returns a zero differential and no average for a player with no games', () => {
    const games = [gs(1, X, 21, Y, 10)]
    const rec = pointDifferential(games, 'p')
    expect(rec.total).toBe(0)
    expect(rec.average).toBeNull()
  })

  it('is negative for a losing player on teamA', () => {
    const rec = pointDifferential([gs(1, ['p', 'x2', 'x3'], 10, Y, 21)], 'p')
    expect(rec.total).toBe(-11)
  })

  it('is negative for a losing player on teamB', () => {
    const rec = pointDifferential([gs(1, Y, 21, ['p', 'x2', 'x3'], 10)], 'p')
    expect(rec.total).toBe(-11)
  })

  it('is positive for a winning player on teamB', () => {
    const rec = pointDifferential([gs(1, Y, 10, ['p', 'x2', 'x3'], 21)], 'p')
    expect(rec.total).toBe(11)
  })
})

describe('currentStreak', () => {
  it('returns null for a player with no games', () => {
    expect(currentStreak([g(1, X, Y, 'a')], 'nobody')).toBeNull()
  })

  it('reports a winning streak counting back from the most recent game', () => {
    const games = [
      g(1, ['p', 'x2', 'x3'], Y, 'a'), // win
      g(2, ['p', 'x2', 'x3'], Y, 'a'), // win
      g(3, ['p', 'x2', 'x3'], Y, 'a'), // win
    ]
    expect(currentStreak(games, 'p')).toEqual({ result: 'W', length: 3 })
  })

  it('reports a losing streak counting back from the most recent game', () => {
    const games = [
      g(1, ['p', 'x2', 'x3'], Y, 'a'), // win
      g(2, ['p', 'x2', 'x3'], Y, 'b'), // loss
      g(3, ['p', 'x2', 'x3'], Y, 'b'), // loss
    ]
    expect(currentStreak(games, 'p')).toEqual({ result: 'L', length: 2 })
  })

  it('stops the streak at the first result that breaks it, most recent first', () => {
    const games = [
      g(1, ['p', 'x2', 'x3'], Y, 'b'), // loss (oldest)
      g(2, ['p', 'x2', 'x3'], Y, 'a'), // win
      g(3, ['p', 'x2', 'x3'], Y, 'a'), // win (most recent)
    ]
    expect(currentStreak(games, 'p')).toEqual({ result: 'W', length: 2 })
  })

  it('is a single-game streak after only one game', () => {
    expect(currentStreak([g(1, ['p', 'x2', 'x3'], Y, 'a')], 'p')).toEqual({ result: 'W', length: 1 })
  })

  it('ignores voided games entirely, including a voided most-recent game', () => {
    const games = [
      g(1, ['p', 'x2', 'x3'], Y, 'a'), // win, live
      g(2, ['p', 'x2', 'x3'], Y, 'a'), // win, live
      { ...g(3, ['p', 'x2', 'x3'], Y, 'b'), voided: true }, // loss, but voided
    ]
    expect(currentStreak(games, 'p')).toEqual({ result: 'W', length: 2 })
  })

  it('counts across a voided game sitting in the middle of the streak', () => {
    const games = [
      g(1, ['p', 'x2', 'x3'], Y, 'a'), // win, live
      { ...g(2, ['p', 'x2', 'x3'], Y, 'b'), voided: true }, // loss, voided — must not break the streak
      g(3, ['p', 'x2', 'x3'], Y, 'a'), // win, live
    ]
    expect(currentStreak(games, 'p')).toEqual({ result: 'W', length: 2 })
  })

  it('only counts games the player actually appeared in', () => {
    const games = [
      g(1, ['p', 'x2', 'x3'], Y, 'a'), // win
      g(2, X, Y, 'b'), // p not in this game
    ]
    expect(currentStreak(games, 'p')).toEqual({ result: 'W', length: 1 })
  })

  it('works when the player is on teamB', () => {
    const games = [g(1, Y, ['p', 'x2', 'x3'], 'b')]
    expect(currentStreak(games, 'p')).toEqual({ result: 'W', length: 1 })
  })
})

describe('liveGames', () => {
  it('drops voided games and sorts the rest oldest-first', () => {
    const games = [g(3, X, Y, 'a'), { ...g(2, X, Y, 'a'), voided: true }, g(1, X, Y, 'a')]
    expect(liveGames(games).map((x) => x.ord)).toEqual([1, 3])
  })

  it('does not mutate the input array', () => {
    const games = [g(2, X, Y, 'a'), g(1, X, Y, 'a')]
    const copy = games.map((x) => ({ ...x }))
    liveGames(games)
    expect(games).toEqual(copy)
  })
})

describe('currentStreakFromLive / pointDifferentialFromLive', () => {
  it('agree with the games-based functions when given the same history pre-sorted', () => {
    const games = [
      gs(1, ['p', 'x2', 'x3'], 21, Y, 10),
      gs(2, ['p', 'x2', 'x3'], 21, Z, 4),
    ]
    const live = liveGames(games)
    expect(currentStreakFromLive(live, 'p')).toEqual(currentStreak(games, 'p'))
    expect(pointDifferentialFromLive(live, 'p')).toEqual(pointDifferential(games, 'p'))
  })

  it('let a caller share one sort across several players instead of re-sorting per call', () => {
    const games = [gs(1, ['p', 'x2', 'x3'], 21, Y, 10), gs(2, Z, 21, ['q', 'z2', 'z3'], 3)]
    const live = liveGames(games)
    expect(currentStreakFromLive(live, 'p')).toEqual({ result: 'W', length: 1 })
    expect(currentStreakFromLive(live, 'q')).toEqual({ result: 'L', length: 1 })
    expect(pointDifferentialFromLive(live, 'p').total).toBe(11)
  })
})
