import { describe, expect, it } from 'vitest'
import { classifySwipe, swipeTarget } from '@/lib/ui/swipe'

describe('swipeTarget', () => {
  it('goes to the next tab on a swipe left', () => {
    expect(swipeTarget('/', 'left')).toBe('/table')
    expect(swipeTarget('/table', 'left')).toBe('/roster')
  })

  it('goes to the previous tab on a swipe right', () => {
    expect(swipeTarget('/roster', 'right')).toBe('/table')
    expect(swipeTarget('/table', 'right')).toBe('/')
  })

  it('stops at the ends rather than wrapping around', () => {
    expect(swipeTarget('/roster', 'left')).toBeNull()
    expect(swipeTarget('/', 'right')).toBeNull()
  })

  it('treats a page inside a tab as that tab', () => {
    expect(swipeTarget('/players/x', 'left')).toBe('/table')
    expect(swipeTarget('/games', 'left')).toBe('/table')
  })

  it('does nothing off the tabs', () => {
    expect(swipeTarget('/gate', 'left')).toBeNull()
  })
})

describe('classifySwipe', () => {
  const flick = { dx: -120, dy: 8, ms: 180, startX: 200, width: 375 }

  it('reads a quick sideways flick as a swipe', () => {
    expect(classifySwipe(flick)).toBe('left')
    expect(classifySwipe({ ...flick, dx: 120 })).toBe('right')
  })

  it('ignores a mostly vertical drag, so scrolling never changes tab', () => {
    expect(classifySwipe({ ...flick, dx: -90, dy: 70 })).toBeNull()
  })

  it('ignores a short nudge', () => {
    expect(classifySwipe({ ...flick, dx: -40 })).toBeNull()
  })

  it('ignores a slow drag', () => {
    expect(classifySwipe({ ...flick, ms: 1000 })).toBeNull()
  })

  it('leaves the screen edges to the phone', () => {
    expect(classifySwipe({ ...flick, startX: 10 })).toBeNull()
    expect(classifySwipe({ ...flick, dx: 120, startX: 365 })).toBeNull()
  })
})
