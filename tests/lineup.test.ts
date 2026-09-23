import { describe, expect, it } from 'vitest'
import {
  clearAll,
  clearSlot,
  createLineup,
  droppedPlayers,
  emptyCount,
  facingSlot,
  firstEmptySlot,
  fromStoredLineup,
  isComplete,
  isStoredLineup,
  placeInSlot,
  resize,
  sideOf,
  slotCount,
  slotNumber,
  swapAcross,
  tapRoster,
  tapSlot,
  toStoredLineup,
  toTeams,
  type Lineup,
} from '@/lib/domain/lineup'

/** A full 3v3: holders H1 H2 H3 facing challengers C1 C2 C3. */
function full3v3(active: number | null = null): Lineup {
  return { ...createLineup(3, ['H1', 'H2', 'H3'], ['C1', 'C2', 'C3']), active }
}

describe('slot geometry', () => {
  it('splits the board into a holding half and a challenging half', () => {
    expect(slotCount(3)).toBe(6)
    expect(slotCount(2)).toBe(4)
    expect([0, 1, 2, 3, 4, 5].map((i) => sideOf(3, i))).toEqual([
      'holders',
      'holders',
      'holders',
      'challengers',
      'challengers',
      'challengers',
    ])
    expect([0, 1, 2, 3].map((i) => sideOf(2, i))).toEqual(['holders', 'holders', 'challengers', 'challengers'])
  })

  it('faces each slot with the one opposite it, both ways round', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => facingSlot(3, i))).toEqual([3, 4, 5, 0, 1, 2])
    expect([0, 1, 2, 3].map((i) => facingSlot(2, i))).toEqual([2, 3, 0, 1])
  })

  it('numbers slots within their own side, not across the board', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => slotNumber(3, i))).toEqual([1, 2, 3, 1, 2, 3])
  })
})

describe('createLineup', () => {
  it('seats holders then challengers, in order', () => {
    expect(createLineup(3, ['H1', 'H2', 'H3'], ['C1', 'C2', 'C3']).slots).toEqual([
      'H1',
      'H2',
      'H3',
      'C1',
      'C2',
      'C3',
    ])
  })

  it('leaves empty slots for a short roster and cuts a long one to fit', () => {
    expect(createLineup(2, ['H1'], ['C1', 'C2', 'C3']).slots).toEqual(['H1', null, 'C1', 'C2'])
  })

  it('opens with nothing active', () => {
    expect(createLineup(2, ['H1', 'H2'], ['C1', 'C2']).active).toBeNull()
  })

  it('refuses to seat the same player twice even if handed them twice', () => {
    expect(createLineup(2, ['H1', 'H2'], ['H1', 'C2']).slots).toEqual(['H1', 'H2', null, 'C2'])
  })
})

describe('placing a name in a slot', () => {
  it('fills an empty slot and touches nothing else', () => {
    const before = createLineup(3, ['H1', 'H2', 'H3'], ['C1', 'C2'])
    const after = placeInSlot(before, 5, 'C3')
    expect(after.slots).toEqual(['H1', 'H2', 'H3', 'C1', 'C2', 'C3'])
  })

  it('replaces whoever was there when the newcomer is not already on the board', () => {
    const after = placeInSlot(full3v3(), 1, 'SUB')
    expect(after.slots).toEqual(['H1', 'SUB', 'H3', 'C1', 'C2', 'C3'])
  })

  it('trades slots when the player is already on the board, rather than cloning them', () => {
    // C1 (slot 3, challengers) is asked into slot 0 (holders). H1 does not
    // vanish and does not appear twice — they take C1's old slot.
    const after = placeInSlot(full3v3(), 0, 'C1')
    expect(after.slots).toEqual(['C1', 'H2', 'H3', 'H1', 'C2', 'C3'])
  })

  it('trades within a side too', () => {
    expect(placeInSlot(full3v3(), 0, 'H3').slots).toEqual(['H3', 'H2', 'H1', 'C1', 'C2', 'C3'])
  })

  it('trading into an empty slot leaves the emptiness behind, not a copy', () => {
    const before: Lineup = { size: 3, slots: ['H1', 'H2', 'H3', 'C1', null, 'C3'], active: null }
    // Board: H1 H2 H3 | C1 _ C3. Move H2 across into the hole at slot 4.
    const after = placeInSlot(before, 4, 'H2')
    expect(after.slots).toEqual(['H1', null, 'H3', 'C1', 'H2', 'C3'])
  })

  it('is a no-op when the player is already in that exact slot', () => {
    const before = full3v3()
    expect(placeInSlot(before, 2, 'H3')).toBe(before)
  })

  it('ignores an index off the board', () => {
    const before = full3v3()
    expect(placeInSlot(before, 6, 'X')).toBe(before)
    expect(placeInSlot(before, -1, 'X')).toBe(before)
  })

  it('never moves a third player, whatever is placed where', () => {
    // The whole point of the slot model: exactly the slots named in the
    // operation change, so every other slot still holds who it held.
    const before = full3v3()
    for (let index = 0; index < 6; index++) {
      for (const id of ['H1', 'H2', 'H3', 'C1', 'C2', 'C3', 'SUB']) {
        const after = placeInSlot(before, index, id)
        const from = before.slots.indexOf(id)
        const touched = new Set(from === -1 ? [index] : [index, from])
        for (let i = 0; i < 6; i++) {
          if (!touched.has(i)) expect(after.slots[i]).toBe(before.slots[i])
        }
      }
    }
  })
})

describe('no player is ever in two slots at once', () => {
  it('holds after any single placement onto a full board', () => {
    const before = full3v3()
    for (let index = 0; index < 6; index++) {
      for (const id of ['H1', 'H2', 'H3', 'C1', 'C2', 'C3']) {
        const placed = placeInSlot(before, index, id).slots.filter((s) => s !== null)
        expect(new Set(placed).size).toBe(placed.length)
      }
    }
  })

  it('holds after a long run of roster taps against an active slot', () => {
    let lineup: Lineup = { ...createLineup(3, [], []), active: 0 }
    const roster = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    for (let i = 0; i < 60; i++) {
      lineup = tapSlot(lineup, i % 6)
      lineup = tapRoster(lineup, roster[i % roster.length])
      const placed = lineup.slots.filter((s) => s !== null)
      expect(new Set(placed).size).toBe(placed.length)
      expect(lineup.slots.length).toBe(6)
    }
  })
})

describe('tapping a slot', () => {
  it('makes it the active one', () => {
    expect(tapSlot(full3v3(), 4).active).toBe(4)
  })

  it('tapping the active slot empties it and keeps it active, ready for a name', () => {
    const after = tapSlot(full3v3(2), 2)
    expect(after.slots).toEqual(['H1', 'H2', null, 'C1', 'C2', 'C3'])
    expect(after.active).toBe(2)
  })

  it('clearing one slot leaves every other player where they stood', () => {
    expect(clearSlot(full3v3(), 3).slots).toEqual(['H1', 'H2', 'H3', null, 'C2', 'C3'])
  })

  it('ignores an index off the board', () => {
    const before = full3v3()
    expect(tapSlot(before, 9)).toBe(before)
    expect(clearSlot(before, 9)).toBe(before)
  })
})

describe('the swap control between facing slots', () => {
  it('sends the two facing players across sides and moves nobody else', () => {
    expect(swapAcross(full3v3(), 1).slots).toEqual(['H1', 'C2', 'H3', 'C1', 'H2', 'C3'])
  })

  it('reads the same from either end of the pair', () => {
    expect(swapAcross(full3v3(), 4).slots).toEqual(swapAcross(full3v3(), 1).slots)
  })

  it('swapping twice puts the board back exactly as it was', () => {
    expect(swapAcross(swapAcross(full3v3(), 0), 0).slots).toEqual(full3v3().slots)
  })

  it('carries a lone player across when the facing slot is empty', () => {
    const before = createLineup(2, ['H1', 'H2'], ['C1'])
    // Board: H1 H2 | C1 _. Swap the second pair: H2 crosses, the hole comes back.
    expect(swapAcross(before, 1).slots).toEqual(['H1', null, 'C1', 'H2'])
  })

  it('leaves the active slot alone', () => {
    expect(swapAcross(full3v3(2), 0).active).toBe(2)
  })
})

describe('tapping a roster name', () => {
  it('lands in the active slot', () => {
    expect(tapRoster(full3v3(1), 'SUB').slots).toEqual(['H1', 'SUB', 'H3', 'C1', 'C2', 'C3'])
  })

  it('trades when the name is already on the board', () => {
    expect(tapRoster(full3v3(0), 'C3').slots).toEqual(['C3', 'H2', 'H3', 'C1', 'C2', 'H1'])
  })

  it('with nothing active, fills the first empty slot', () => {
    const before = createLineup(3, ['H1'], ['C1'])
    // Board: H1 _ _ | C1 _ _ — the first hole is slot 1, not the next
    // challenger slot.
    expect(firstEmptySlot(before)).toBe(1)
    expect(tapRoster(before, 'NEW').slots).toEqual(['H1', 'NEW', null, 'C1', null, null])
  })

  it('with nothing active, builds a whole lineup one tap at a time, holders first', () => {
    let lineup = createLineup(2, [], [])
    for (const id of ['A', 'B', 'C', 'D']) lineup = tapRoster(lineup, id)
    expect(lineup.slots).toEqual(['A', 'B', 'C', 'D'])
    expect(toTeams(lineup)).toEqual({ holders: ['A', 'B'], challengers: ['C', 'D'] })
  })

  it('with nothing active, a name already on the board steps off it', () => {
    expect(tapRoster(full3v3(), 'H2').slots).toEqual(['H1', null, 'H3', 'C1', 'C2', 'C3'])
  })

  it('with nothing active and no room, changes nothing', () => {
    const before = full3v3()
    expect(tapRoster(before, 'SUB')).toBe(before)
  })
})

describe('clearing the whole board', () => {
  it('empties every slot and drops the active one', () => {
    const after = clearAll(full3v3(1))
    expect(after.slots).toEqual([null, null, null, null, null, null])
    expect(after.active).toBeNull()
    expect(after.size).toBe(3)
  })
})

describe('changing team size', () => {
  it('3v3 → 2v2 keeps the players who still fit on their own side', () => {
    expect(resize(full3v3(), 2).slots).toEqual(['H1', 'H2', 'C1', 'C2'])
  })

  it('2v2 → 3v3 keeps everyone and opens one empty slot per side', () => {
    const small = createLineup(2, ['H1', 'H2'], ['C1', 'C2'])
    expect(resize(small, 3).slots).toEqual(['H1', 'H2', null, 'C1', 'C2', null])
  })

  it('3v3 → 2v2 → 3v3 keeps the four who fit rather than wiping the board', () => {
    const roundTrip = resize(resize(full3v3(), 2), 3)
    expect(roundTrip.slots).toEqual(['H1', 'H2', null, 'C1', 'C2', null])
  })

  it('closes gaps within a side so a half-filled board keeps its names', () => {
    // Board: _ H2 H3 | C1 _ C3 — shrinking must not throw away H2 and C1
    // just because they sit past an empty slot.
    const gappy: Lineup = { size: 3, slots: [null, 'H2', 'H3', 'C1', null, 'C3'], active: null }
    expect(resize(gappy, 2).slots).toEqual(['H2', 'H3', 'C1', 'C3'])
  })

  it('is a no-op when the size is unchanged', () => {
    const before = full3v3(2)
    expect(resize(before, 3)).toBe(before)
  })

  it('drops the active slot, since the indices no longer mean the same thing', () => {
    expect(resize(full3v3(5), 2).active).toBeNull()
  })
})

describe('who a size change leaves no room for', () => {
  it('names the players the smaller board cannot hold', () => {
    const before = full3v3()
    expect(droppedPlayers(before, resize(before, 2))).toEqual(['H3', 'C3'])
  })

  it('names nobody when the board grows', () => {
    const small = createLineup(2, ['H1', 'H2'], ['C1', 'C2'])
    expect(droppedPlayers(small, resize(small, 3))).toEqual([])
  })

  it('names nobody when the shrinking board had empty slots to give up', () => {
    const half = createLineup(3, ['H1', 'H2'], ['C1'])
    expect(droppedPlayers(half, resize(half, 2))).toEqual([])
  })

  it('reads past gaps to name whoever actually fell off', () => {
    // _ H2 H3 | C1 C2 C3 → 2v2 keeps H2 H3 and C1 C2, so only C3 goes.
    const gappy: Lineup = { size: 3, slots: [null, 'H2', 'H3', 'C1', 'C2', 'C3'], active: null }
    expect(droppedPlayers(gappy, resize(gappy, 2))).toEqual(['C3'])
  })
})

describe('readiness and the rosters handed to setTeams', () => {
  it('counts the empty slots for the "fill N more" affordance', () => {
    expect(emptyCount(full3v3())).toBe(0)
    expect(emptyCount(createLineup(3, ['H1'], []))).toBe(5)
    expect(isComplete(full3v3())).toBe(true)
    expect(isComplete(createLineup(3, ['H1'], []))).toBe(false)
  })

  it('splits the slots back into holders and challengers', () => {
    expect(toTeams(full3v3())).toEqual({
      holders: ['H1', 'H2', 'H3'],
      challengers: ['C1', 'C2', 'C3'],
    })
    expect(toTeams(createLineup(2, ['H1', 'H2'], ['C1', 'C2']))).toEqual({
      holders: ['H1', 'H2'],
      challengers: ['C1', 'C2'],
    })
  })

  it('refuses to produce teams while any slot is empty', () => {
    expect(toTeams(clearSlot(full3v3(), 4))).toBeNull()
    expect(toTeams(createLineup(3, [], []))).toBeNull()
  })

  // TableMode casts the live table's team size (`requiredChallengers as
  // TeamSize`), so a session with no holders could hand this a size of 0.
  // `[].every(...)` is true, which would have called an empty board complete
  // and enabled Save on a lineup of nobody.
  it('a board whose size never came from the toggle is never complete', () => {
    const noBody = { size: 0, slots: [], active: null } as unknown as Lineup
    expect(isComplete(noBody)).toBe(false)
    expect(toTeams(noBody)).toBeNull()
  })

  it('a board with the wrong number of slots for its size is never complete', () => {
    const short = { size: 3, slots: ['a', 'b', 'c', 'd'], active: null } as unknown as Lineup
    expect(isComplete(short)).toBe(false)
    expect(toTeams(short)).toBeNull()
  })

  // The empty string reads as "filled" to anything checking for null, but it
  // is not a player: it would sail past Save and die at setTeams as an
  // unknown player id.
  it('the empty string is not a player, in either direction', () => {
    const blank = { size: 2, slots: ['a', '', 'c', 'd'], active: null } as unknown as Lineup
    expect(isComplete(blank)).toBe(false)
    expect(toTeams(blank)).toBeNull()
    expect(emptyCount(blank)).toBe(1)
  })

  it('createLineup and isStoredLineup agree that the empty string is not a player', () => {
    expect(createLineup(2, ['a', ''], ['c', 'd']).slots).toEqual(['a', null, 'c', 'd'])
    expect(isStoredLineup({ size: 2, slots: ['a', '', 'c', 'd'] })).toBe(false)
  })

  it('reports the sides the way the swap left them, not the way they started', () => {
    expect(toTeams(swapAcross(full3v3(), 0))).toEqual({
      holders: ['C1', 'H2', 'H3'],
      challengers: ['H1', 'C2', 'C3'],
    })
  })
})

describe('the stored lineup shape', () => {
  it('round trips a board through storage, minus the active slot', () => {
    const stored = toStoredLineup(full3v3(4))
    expect(stored).toEqual({ size: 3, slots: ['H1', 'H2', 'H3', 'C1', 'C2', 'C3'] })
    const back = fromStoredLineup(stored)
    expect(back.slots).toEqual(stored.slots)
    expect(back.size).toBe(3)
    expect(back.active).toBeNull()
  })

  it('accepts a well-formed board, full or half-finished', () => {
    expect(isStoredLineup({ size: 3, slots: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe(true)
    expect(isStoredLineup({ size: 2, slots: [null, null, null, null] })).toBe(true)
    expect(isStoredLineup({ size: 2, slots: ['a', null, 'b', null] })).toBe(true)
  })

  it('rejects a slot count that does not match its own size', () => {
    expect(isStoredLineup({ size: 3, slots: ['a', 'b', 'c', 'd'] })).toBe(false)
    expect(isStoredLineup({ size: 2, slots: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe(false)
  })

  it('rejects a size the toggle cannot represent', () => {
    expect(isStoredLineup({ size: 4, slots: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })).toBe(false)
    expect(isStoredLineup({ size: '3', slots: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe(false)
  })

  it('rejects the same player in two slots', () => {
    expect(isStoredLineup({ size: 2, slots: ['a', 'b', 'a', 'c'] })).toBe(false)
  })

  it('rejects entries that are neither a player id nor an empty slot', () => {
    expect(isStoredLineup({ size: 2, slots: ['a', 'b', 'c', 7] })).toBe(false)
    expect(isStoredLineup({ size: 2, slots: ['a', 'b', 'c', undefined] })).toBe(false)
  })

  it('rejects non-objects and a missing slots array', () => {
    expect(isStoredLineup(null)).toBe(false)
    expect(isStoredLineup('3v3')).toBe(false)
    expect(isStoredLineup({ size: 3 })).toBe(false)
  })
})
