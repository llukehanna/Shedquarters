import { describe, expect, it } from 'vitest'
import { createLineup, type Lineup } from '@/lib/domain/lineup'
import { rosterTapLabel, sideLabel, slotLabel } from '@/lib/ui/lineup-labels'

/** Player ids are their own display names here, bar the two the roster renames. */
const NAMES: Record<string, string> = { H1: 'Marcus', C1: 'Dev' }
const nameOf = (id: string) => NAMES[id] ?? id

/** H1 H2 H3 holding, C1 C2 C3 challenging, with `active` aimed wherever asked. */
function board(active: number | null, slots?: (string | null)[]): Lineup {
  const base = createLineup(3, ['H1', 'H2', 'H3'], ['C1', 'C2', 'C3'])
  return { ...base, slots: slots ?? base.slots, active }
}

describe('naming a slot', () => {
  it('names the side a slot belongs to', () => {
    expect(sideLabel(3, 0)).toBe('Holding the table')
    expect(sideLabel(3, 3)).toBe('Challengers')
    expect(sideLabel(2, 1)).toBe('Holding the table')
    expect(sideLabel(2, 2)).toBe('Challengers')
  })

  it('numbers the slot within its own side', () => {
    expect(slotLabel(3, 0)).toBe('Holding the table, slot 1')
    expect(slotLabel(3, 2)).toBe('Holding the table, slot 3')
    expect(slotLabel(3, 3)).toBe('Challengers, slot 1')
    expect(slotLabel(2, 3)).toBe('Challengers, slot 2')
  })
})

// The chip's accessible name is a promise about what the tap will do. Each
// branch below is a different promise, and every one of them has to match
// what `tapRoster` actually does to this board.
describe('rosterTapLabel', () => {
  describe('with a slot aimed at', () => {
    it('1. says nothing will happen when they already stand there', () => {
      expect(rosterTapLabel(board(0), 'H1', nameOf)).toBe('Marcus is already in Holding the table, slot 1')
    })

    it('2. offers a plain placement into an empty aimed slot', () => {
      const withHole = board(1, ['H1', null, 'H3', 'C1', 'C2', 'C3'])
      expect(rosterTapLabel(withHole, 'SUB', nameOf)).toBe('Put SUB in Holding the table, slot 2')
    })

    it('3. names who a newcomer would replace', () => {
      expect(rosterTapLabel(board(4), 'SUB', nameOf)).toBe(
        'Put SUB in Challengers, slot 2, replacing C2',
      )
    })

    it('4. calls it a move when the aimed slot is empty and they are already on the board', () => {
      const withHole = board(4, ['H1', 'H2', 'H3', 'C1', null, 'C3'])
      expect(rosterTapLabel(withHole, 'H1', nameOf)).toBe('Move Marcus to Challengers, slot 2')
    })

    it('5. calls it a swap when both are on the board — because the slots trade', () => {
      expect(rosterTapLabel(board(0), 'C1', nameOf)).toBe('Swap Dev with Marcus')
    })
  })

  describe('with nothing aimed at', () => {
    it('6. offers to take an on-board player off the slot they hold', () => {
      expect(rosterTapLabel(board(null), 'C3', nameOf)).toBe('Take C3 off Challengers, slot 3')
    })

    it('7. names the slot the tap would actually fill, not "the first empty slot"', () => {
      const gappy = board(null, ['H1', null, 'H3', 'C1', null, 'C3'])
      expect(rosterTapLabel(gappy, 'SUB', nameOf)).toBe('Put SUB in Holding the table, slot 2')
    })

    it('8. admits there is nowhere to put them when the board is full', () => {
      expect(rosterTapLabel(board(null), 'SUB', nameOf)).toBe('No empty slot for SUB — tap a slot first')
    })
  })

  it('follows the aim: the same player and board read differently per active slot', () => {
    const b = (active: number | null) => rosterTapLabel(board(active, ['H1', 'H2', 'H3', 'C1', 'C2', null]), 'H1', nameOf)
    expect(b(null)).toBe('Take Marcus off Holding the table, slot 1')
    expect(b(0)).toBe('Marcus is already in Holding the table, slot 1')
    expect(b(5)).toBe('Move Marcus to Challengers, slot 3')
    expect(b(3)).toBe('Swap Marcus with Dev')
  })

  it('works the same on a 2v2 board', () => {
    const small = { ...createLineup(2, ['H1', 'H2'], ['C1', 'C2']), active: 3 }
    expect(rosterTapLabel(small, 'H2', nameOf)).toBe('Swap H2 with C2')
    expect(rosterTapLabel(small, 'SUB', nameOf)).toBe('Put SUB in Challengers, slot 2, replacing C2')
  })
})
