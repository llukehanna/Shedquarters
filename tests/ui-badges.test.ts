import { describe, it, expect } from 'vitest'
import { badgeViews } from '@/lib/ui/badges'
import { BADGE_COPY, GHOST_DAYS, type Badge } from '@/lib/domain/badges'
import { PROVISIONAL_GAMES } from '@/lib/domain/ratings'

describe('badgeViews', () => {
  it('renders nothing for a player with no badges', () => {
    expect(badgeViews([])).toEqual([])
  })

  it('formats a tally as a multiplication sign and the number', () => {
    expect(badgeViews([{ kind: 'skunk', count: 3 }])).toEqual([
      {
        kind: 'skunk',
        name: 'Skunk',
        count: '×3',
        blurb: BADGE_COPY.skunk.blurb,
      },
    ])
  })

  it('carries a two-digit tally through intact', () => {
    expect(badgeViews([{ kind: 'heartbreaker', count: 12 }])[0].count).toBe('×12')
  })

  it('shows no tally at all for the badges that do not have one', () => {
    const views = badgeViews([
      { kind: 'rookie', count: null },
      { kind: 'ghost', count: null },
    ])
    expect(views.map((v) => v.count)).toEqual([null, null])
  })

  it('distinguishes a count of one from no count, rather than hiding both', () => {
    expect(badgeViews([{ kind: 'skunk', count: 1 }])[0].count).toBe('×1')
    expect(badgeViews([{ kind: 'rookie', count: null }])[0].count).toBeNull()
  })

  it('gives every badge kind a name and a blurb taken from BADGE_COPY', () => {
    const all: Badge[] = (Object.keys(BADGE_COPY) as Array<keyof typeof BADGE_COPY>).map((kind) => ({
      kind,
      count: null,
    }))
    for (const v of badgeViews(all)) {
      expect(v.name).toBe(BADGE_COPY[v.kind].name)
      expect(v.blurb).toBe(BADGE_COPY[v.kind].blurb)
    }
  })

  it('preserves the order it was given, which is the order badges are earned in', () => {
    const order: Badge[] = [
      { kind: 'ghost', count: null },
      { kind: 'skunk', count: 2 },
      { kind: 'rookie', count: null },
    ]
    expect(badgeViews(order).map((v) => v.kind)).toEqual(['ghost', 'skunk', 'rookie'])
  })
})

describe('badge copy', () => {
  it('is one line per badge, with a name', () => {
    for (const [kind, copy] of Object.entries(BADGE_COPY)) {
      expect(copy.name, kind).toMatch(/\S/)
      expect(copy.blurb.split('\n'), kind).toHaveLength(1)
    }
  })

  // Every blurb is a joke somebody signed off on, and a length check can't
  // tell a joke from filler — the limp first draft of Skunk ("Won a game the
  // other team finished on zero.") passed one. Pin the words, so rewriting
  // one is a deliberate act with an owner's eyes on it.
  it('is the copy that was signed off', () => {
    expect(
      Object.fromEntries(Object.entries(BADGE_COPY).map(([k, c]) => [k, c.blurb])),
    ).toEqual({
      skunk: 'Held a team to nothing. They are still blaming the table.',
      heartbreaker: 'Won one past the target. Somebody is still thinking about it.',
      rookie: 'Under 10 games in. The rating is still guessing.',
      ghost: 'No games in 21 days. The table has moved on.',
    })
  })

  it('quotes the same thresholds the rules use, so the words cannot drift from the logic', () => {
    expect(BADGE_COPY.rookie.blurb).toContain(String(PROVISIONAL_GAMES))
    expect(BADGE_COPY.ghost.blurb).toContain(String(GHOST_DAYS))
  })
})
