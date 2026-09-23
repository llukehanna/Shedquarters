import { describe, it, expect } from 'vitest'
import { nextTrapFocus, FOCUSABLE_SELECTOR } from '@/lib/ui/focus'

describe('nextTrapFocus', () => {
  it('leaves an ordinary step in the middle to the browser', () => {
    expect(nextTrapFocus(5, 1, false)).toBeNull()
    expect(nextTrapFocus(5, 3, false)).toBeNull()
    expect(nextTrapFocus(5, 2, true)).toBeNull()
  })

  it('wraps forward off the last element to the first', () => {
    expect(nextTrapFocus(5, 4, false)).toBe(0)
  })

  it('wraps backward off the first element to the last', () => {
    expect(nextTrapFocus(5, 0, true)).toBe(4)
  })

  it('does not wrap backward off the last, or forward off the first', () => {
    expect(nextTrapFocus(5, 4, true)).toBeNull()
    expect(nextTrapFocus(5, 0, false)).toBeNull()
  })

  it('pulls focus back in when it has escaped the trap entirely', () => {
    // -1 is "document.activeElement is not in our list" — the case a trap
    // exists for. It must not be treated as an ordinary step.
    expect(nextTrapFocus(5, -1, false)).toBe(0)
    expect(nextTrapFocus(5, -1, true)).toBe(4)
  })

  it('handles a trap with a single focusable by keeping focus on it', () => {
    expect(nextTrapFocus(1, 0, false)).toBe(0)
    expect(nextTrapFocus(1, 0, true)).toBe(0)
    expect(nextTrapFocus(1, -1, false)).toBe(0)
  })

  it('gives up on an empty trap rather than returning an out-of-range index', () => {
    expect(nextTrapFocus(0, -1, false)).toBeNull()
    expect(nextTrapFocus(0, 0, true)).toBeNull()
  })

  it('never returns an index outside the list', () => {
    for (const count of [1, 2, 3, 8]) {
      for (let current = -1; current < count; current++) {
        for (const shift of [true, false]) {
          const next = nextTrapFocus(count, current, shift)
          if (next !== null) {
            expect(next, `count=${count} current=${current} shift=${shift}`).toBeGreaterThanOrEqual(0)
            expect(next, `count=${count} current=${current} shift=${shift}`).toBeLessThan(count)
          }
        }
      }
    }
  })
})

describe('FOCUSABLE_SELECTOR', () => {
  // A substring check passes for a selector that matches nothing at all — a
  // typo'd `xbutton:not([disabled])` still "contains" the text we looked for,
  // while the trap silently finds zero focusables. Pin the whole selector
  // instead, so any edit to it is a deliberate one a reader has to approve.
  it('is exactly the list the focus trap depends on', () => {
    expect(FOCUSABLE_SELECTOR.split(',').map((s) => s.trim())).toEqual([
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ])
  })
})
