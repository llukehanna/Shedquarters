import { describe, it, expect } from 'vitest'
import { groupByNight, liveGameCount, capGameLog } from '@/lib/domain/game-log'

function g(ord: number, sessionId: string, createdAt: string) {
  return { ord, sessionId, createdAt }
}

describe('groupByNight', () => {
  it('groups games by session id', () => {
    const groups = groupByNight([
      g(1, 's1', '2026-09-01T20:00:00.000Z'),
      g(2, 's1', '2026-09-01T20:10:00.000Z'),
      g(3, 's2', '2026-09-05T21:00:00.000Z'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.find((x) => x.sessionId === 's1')!.games).toHaveLength(2)
    expect(groups.find((x) => x.sessionId === 's2')!.games).toHaveLength(1)
  })

  it('orders nights newest first, by each night\'s highest ord', () => {
    // Ord is the trustworthy global order (see lib/domain/ratings.ts's
    // GameRecord.ord doc comment) — deriving night order from it rather
    // than from created_at timestamps avoids relying on clock ordering
    // matching insert ordering.
    const groups = groupByNight([
      g(1, 's1', '2026-09-01T20:00:00.000Z'),
      g(2, 's2', '2026-09-05T21:00:00.000Z'),
    ])
    expect(groups.map((x) => x.sessionId)).toEqual(['s2', 's1'])
  })

  it('orders games within a night newest first', () => {
    const groups = groupByNight([
      g(1, 's1', '2026-09-01T20:00:00.000Z'),
      g(2, 's1', '2026-09-01T20:10:00.000Z'),
      g(3, 's1', '2026-09-01T20:20:00.000Z'),
    ])
    expect(groups[0].games.map((x) => x.ord)).toEqual([3, 2, 1])
  })

  it('uses the earliest game in a session as the night date, not the latest', () => {
    const groups = groupByNight([
      g(5, 's1', '2026-09-01T23:50:00.000Z'),
      g(6, 's1', '2026-09-02T00:10:00.000Z'),
    ])
    expect(groups[0].date).toBe('2026-09-01T23:50:00.000Z')
  })

  it('sorts nights by max ord even when a later session has an earlier timestamp', () => {
    const groups = groupByNight([
      g(10, 's_old', '2026-08-01T20:00:00.000Z'),
      g(1, 's_new', '2026-09-01T20:00:00.000Z'),
      g(11, 's_old', '2026-08-01T20:10:00.000Z'),
    ])
    expect(groups.map((x) => x.sessionId)).toEqual(['s_old', 's_new'])
  })

  it('returns an empty array for no games', () => {
    expect(groupByNight([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [g(1, 's1', '2026-09-01T20:00:00.000Z'), g(2, 's1', '2026-09-01T20:10:00.000Z')]
    const copy = input.map((x) => ({ ...x }))
    groupByNight(input)
    expect(input).toEqual(copy)
  })
})

describe('liveGameCount', () => {
  it('counts only non-voided games', () => {
    const games = [{ voided: false }, { voided: true }, { voided: false }]
    expect(liveGameCount(games)).toBe(2)
  })

  it('is zero when every game in the group was voided', () => {
    expect(liveGameCount([{ voided: true }, { voided: true }])).toBe(0)
  })

  it('is zero for an empty list', () => {
    expect(liveGameCount([])).toBe(0)
  })
})

describe('capGameLog', () => {
  it('is not truncated when rows are at or under the limit', () => {
    expect(capGameLog([1, 2, 3], 3)).toEqual({ rows: [1, 2, 3], truncated: false })
    expect(capGameLog([1, 2], 3)).toEqual({ rows: [1, 2], truncated: false })
  })

  it('trims the extra row and reports truncated when one more row exists', () => {
    // This is the exact bug being fixed: a house with precisely `limit`
    // games ever must not see a false "older games not shown" banner, which
    // only fetching `limit + 1` rows (and checking for that spare row, not
    // `rows.length === limit`) can distinguish from having more.
    expect(capGameLog([1, 2, 3, 4], 3)).toEqual({ rows: [1, 2, 3], truncated: true })
  })

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4]
    capGameLog(input, 3)
    expect(input).toEqual([1, 2, 3, 4])
  })
})
