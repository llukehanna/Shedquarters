import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSetupState,
  clearTableState,
  isStoredPhase,
  isStoredSetupState,
  isStoredTableState,
  isTableStateCurrent,
  loadSetupState,
  loadTableState,
  saveSetupState,
  saveTableState,
  loadTarget,
  saveTarget,
  clearTarget,
  type StoredPhase,
  type StoredTableState,
} from '@/lib/client/persist'

/** Minimal in-memory Storage stub — no jsdom needed. Mirrors tests/queue.test.ts. */
function makeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  globalThis.window = { localStorage: makeLocalStorage() } as unknown as Window & typeof globalThis
})

describe('isStoredSetupState', () => {
  it('accepts a well-formed value', () => {
    expect(isStoredSetupState({ picked: ['a', 'b'], size: 3 })).toBe(true)
    expect(isStoredSetupState({ picked: [], size: 2 })).toBe(true)
  })

  it('rejects a non-array picked list', () => {
    expect(isStoredSetupState({ picked: 'a,b', size: 3 })).toBe(false)
  })

  it('rejects a picked list containing a non-string', () => {
    expect(isStoredSetupState({ picked: ['a', 1], size: 3 })).toBe(false)
  })

  it('rejects a size other than 2 or 3', () => {
    expect(isStoredSetupState({ picked: [], size: 4 })).toBe(false)
    expect(isStoredSetupState({ picked: [], size: '3' })).toBe(false)
  })

  it('rejects null, arrays, and primitives', () => {
    expect(isStoredSetupState(null)).toBe(false)
    expect(isStoredSetupState([])).toBe(false)
    expect(isStoredSetupState('nope')).toBe(false)
    expect(isStoredSetupState(42)).toBe(false)
  })
})

describe('setup state round trip', () => {
  it('saves and loads the picked list and size', () => {
    expect(loadSetupState('beer_die')).toBeNull()
    saveSetupState('beer_die', { picked: ['x1', 'x2'], size: 2 })
    expect(loadSetupState('beer_die')).toEqual({ picked: ['x1', 'x2'], size: 2, sport: 'beer_die' })
  })

  it('clearSetupState removes it', () => {
    saveSetupState('beer_die', { picked: ['x1'], size: 3 })
    clearSetupState('beer_die')
    expect(loadSetupState('beer_die')).toBeNull()
  })

  it('recovers to null for non-JSON garbage', () => {
    window.localStorage.setItem('house-ladder-setup', 'not-json{{{')
    expect(loadSetupState('beer_die')).toBeNull()
  })

  it('recovers to null for valid JSON of the wrong shape', () => {
    window.localStorage.setItem('house-ladder-setup', '{"picked":["a"]}')
    expect(loadSetupState('beer_die')).toBeNull()
  })

  it('does not throw with no window (server context)', () => {
    Reflect.deleteProperty(globalThis, 'window')
    expect(() => saveSetupState('beer_die', { picked: ['a'], size: 3 })).not.toThrow()
    expect(loadSetupState('beer_die')).toBeNull()
    expect(() => clearSetupState('beer_die')).not.toThrow()
  })
})

describe('isStoredPhase', () => {
  it('accepts every valid variant', () => {
    const variants: StoredPhase[] = [
      { step: 'winner' },
      { step: 'teams' },
      { step: 'score', winner: 'holders' },
      { step: 'score', winner: 'challengers' },
      { step: 'challengers', winner: 'holders', loserScore: 14 },
    ]
    for (const v of variants) expect(isStoredPhase(v)).toBe(true)
  })

  it('rejects a score step with an invalid winner', () => {
    expect(isStoredPhase({ step: 'score', winner: 'nobody' })).toBe(false)
    expect(isStoredPhase({ step: 'score' })).toBe(false)
  })

  it('rejects a challengers step missing or misshaping its fields', () => {
    expect(isStoredPhase({ step: 'challengers', winner: 'holders' })).toBe(false)
    expect(isStoredPhase({ step: 'challengers', winner: 'holders', loserScore: '14' })).toBe(false)
    expect(isStoredPhase({ step: 'challengers', winner: 'holders', loserScore: Number.NaN })).toBe(false)
  })

  it('rejects an unknown step and non-objects', () => {
    expect(isStoredPhase({ step: 'nope' })).toBe(false)
    expect(isStoredPhase(null)).toBe(false)
    expect(isStoredPhase('winner')).toBe(false)
  })
})

describe('isStoredTableState', () => {
  it('accepts a versioned phase paired with a picked list, a lineup, and a seq', () => {
    expect(isStoredTableState({ v: 2, phase: { step: 'winner' }, picked: [], lineup: null, seq: 0 })).toBe(true)
    expect(
      isStoredTableState({
        v: 2,
        phase: { step: 'challengers', winner: 'holders', loserScore: 5 },
        picked: ['a', 'b'],
        lineup: null,
        seq: 3,
      }),
    ).toBe(true)
    expect(
      isStoredTableState({
        v: 2,
        phase: { step: 'teams' },
        picked: [],
        lineup: { size: 2, slots: ['a', 'b', 'c', null] },
        seq: 3,
      }),
    ).toBe(true)
  })

  it('rejects a malformed phase, picked list, or seq', () => {
    expect(isStoredTableState({ v: 2, phase: { step: 'nope' }, picked: [], lineup: null, seq: 0 })).toBe(false)
    expect(isStoredTableState({ v: 2, phase: { step: 'winner' }, picked: 'a', lineup: null, seq: 0 })).toBe(false)
    expect(isStoredTableState({ v: 2, phase: { step: 'winner' }, picked: [], lineup: null })).toBe(false)
    expect(isStoredTableState({ v: 2, phase: { step: 'winner' }, picked: [], lineup: null, seq: '0' })).toBe(false)
    expect(
      isStoredTableState({ v: 2, phase: { step: 'winner' }, picked: [], lineup: null, seq: Number.NaN }),
    ).toBe(false)
    expect(isStoredTableState(null)).toBe(false)
  })

  // The "Change teams" board used to be stored as one ordered flat list
  // under `picked`, where a player's side was decided by their position in
  // it. A phone that has not picked up the deploy can still write that
  // shape. It must come back as a clean cache miss — read as the new shape
  // it would put the wrong people on the wrong side of the table.
  it('rejects the pre-slot shape outright rather than half-restoring it', () => {
    const v1 = { phase: { step: 'teams' }, picked: ['h1', 'h2', 'h3', 'c1', 'c2', 'c3'], seq: 4 }
    expect(isStoredTableState(v1)).toBe(false)
    // Even with a lineup bolted on, an unversioned or wrongly versioned
    // value is not this shape.
    expect(isStoredTableState({ ...v1, lineup: { size: 3, slots: [null, null, null, null, null, null] } })).toBe(
      false,
    )
    expect(isStoredTableState({ ...v1, v: 1, lineup: null })).toBe(false)
    expect(isStoredTableState({ ...v1, v: '2', lineup: null })).toBe(false)
  })

  it('rejects a lineup that is missing, mis-sized, or holds the same player twice', () => {
    const base = { v: 2, phase: { step: 'teams' }, picked: [], seq: 1 }
    // Absent entirely (not even null) is not a valid stored lineup.
    expect(isStoredTableState(base)).toBe(false)
    // Three slots cannot describe a 2v2 board.
    expect(isStoredTableState({ ...base, lineup: { size: 2, slots: ['a', 'b', 'c'] } })).toBe(false)
    // A duplicate is exactly the state the slot model makes unreachable.
    expect(isStoredTableState({ ...base, lineup: { size: 2, slots: ['a', 'b', 'a', 'c'] } })).toBe(false)
    expect(isStoredTableState({ ...base, lineup: { size: 4, slots: [null, null, null, null] } })).toBe(false)
    expect(isStoredTableState({ ...base, lineup: { size: 2, slots: ['a', 'b', 'c', 7] } })).toBe(false)
  })
})

describe('the stored lineup survives a round trip through storage', () => {
  it('saves and loads a half-finished board', () => {
    const lineup = { size: 3 as const, slots: ['h1', null, 'h3', 'c1', 'c2', null] }
    saveTableState('session-lineup', { phase: { step: 'teams' }, picked: [], lineup, seq: 2 })
    expect(loadTableState('session-lineup')).toEqual({
      v: 2,
      phase: { step: 'teams' },
      picked: [],
      lineup,
      seq: 2,
    })
  })

  it('a board written by the pre-slot build reads back as nothing at all', () => {
    window.localStorage.setItem(
      'house-ladder-table:session-old',
      JSON.stringify({ phase: { step: 'teams' }, picked: ['h1', 'h2', 'h3', 'c1', 'c2', 'c3'], seq: 0 }),
    )
    expect(loadTableState('session-old')).toBeNull()
  })
})

describe('table state round trip', () => {
  const sessionA = 'session-a'
  const sessionB = 'session-b'

  it('saves and loads a phase, picked list, and seq, keyed by session', () => {
    expect(loadTableState(sessionA)).toBeNull()
    saveTableState(sessionA, {
      phase: { step: 'challengers', winner: 'holders', loserScore: 9 },
      picked: ['p1'],
      lineup: null,
      seq: 4,
    })
    expect(loadTableState(sessionA)).toEqual({
      v: 2,
      phase: { step: 'challengers', winner: 'holders', loserScore: 9 },
      picked: ['p1'],
      lineup: null,
      seq: 4,
    })
  })

  it('a stale key from a different session is never read', () => {
    saveTableState(sessionA, { phase: { step: 'teams' }, picked: [], lineup: null, seq: 1 })
    // Reading under a different, live session id must never see session A's
    // stored state — this is the whole mechanism by which an old session's
    // leftovers are ignored rather than actively purged.
    expect(loadTableState(sessionB)).toBeNull()
  })

  it('clearTableState only clears the given session', () => {
    saveTableState(sessionA, { phase: { step: 'teams' }, picked: [], lineup: null, seq: 1 })
    saveTableState(sessionB, { phase: { step: 'winner' }, picked: [], lineup: null, seq: 0 })
    clearTableState(sessionA)
    expect(loadTableState(sessionA)).toBeNull()
    expect(loadTableState(sessionB)).toEqual({ v: 2, phase: { step: 'winner' }, picked: [], lineup: null, seq: 0 })
  })

  it('recovers to null for non-JSON garbage', () => {
    window.localStorage.setItem('house-ladder-table:' + sessionA, 'not-json{{{')
    expect(loadTableState(sessionA)).toBeNull()
  })

  it('recovers to null for valid JSON of the wrong shape', () => {
    window.localStorage.setItem('house-ladder-table:' + sessionA, '{"phase":{"step":"winner"}}')
    expect(loadTableState(sessionA)).toBeNull()
  })

  it('does not throw with no window (server context)', () => {
    Reflect.deleteProperty(globalThis, 'window')
    expect(() => saveTableState(sessionA, { phase: { step: 'winner' }, picked: [], lineup: null, seq: 0 })).not.toThrow()
    expect(loadTableState(sessionA)).toBeNull()
    expect(() => clearTableState(sessionA)).not.toThrow()
  })
})

describe('isTableStateCurrent', () => {
  // This is the fix for the core bug: a phase restored by session id alone,
  // with no check that the table it describes still exists, can commit a
  // fabricated result. Walk the exact scenario — holders beat challengers,
  // the user is mid-entry on the challengers screen, another phone logs a
  // game first (seq advances, holders/challengers rotate), and only then
  // does this phone come back to restore.
  it('is current when the table has not moved since the phase was saved', () => {
    const stored: StoredTableState = {
      v: 2,
      phase: { step: 'challengers', winner: 'holders', loserScore: 12 },
      picked: ['c1', 'c2'],
      lineup: null,
      seq: 5,
    }
    expect(isTableStateCurrent(stored, 5)).toBe(true)
  })

  it('is discarded once another phone has logged a game against the same session', () => {
    // Saved while seq was 5 (mid-entry over the game that made it 5)...
    const stored: StoredTableState = {
      v: 2,
      phase: { step: 'challengers', winner: 'holders', loserScore: 12 },
      picked: ['c1', 'c2'],
      lineup: null,
      seq: 5,
    }
    // ...but the table now on screen is one game further on: someone else
    // logged the result already, so restoring `stored` verbatim would show
    // "next 3 up" over a losing score that belongs to a game that is no
    // longer the one being played.
    expect(isTableStateCurrent(stored, 6)).toBe(false)
  })

  it('nothing stored is never current, regardless of seq', () => {
    expect(isTableStateCurrent(null, 0)).toBe(false)
    expect(isTableStateCurrent(null, 5)).toBe(false)
  })

  it('narrows to StoredTableState when current (compile-time check via property access)', () => {
    const stored: StoredTableState | null = {
      v: 2,
      phase: { step: 'winner' },
      picked: [],
      lineup: null,
      seq: 2,
    }
    if (isTableStateCurrent(stored, 2)) {
      // No non-null assertion needed here — if this compiles, the type
      // predicate narrowed `stored` correctly.
      expect(stored.seq).toBe(2)
    } else {
      throw new Error('expected isTableStateCurrent to be true')
    }
  })
})

describe('setup state with a sport', () => {
  it('round-trips the sport and target', () => {
    saveSetupState('spikeball', { picked: ['x1'], size: 2, target: 11 })
    expect(loadSetupState('spikeball')).toEqual({ picked: ['x1'], size: 2, sport: 'spikeball', target: 11 })
  })

  it('keeps each sport\'s pick apart', () => {
    saveSetupState('beer_die', { picked: ['d1'], size: 3, target: 21 })
    saveSetupState('spikeball', { picked: ['s1'], size: 2, target: 15 })
    clearSetupState('spikeball')
    expect(loadSetupState('spikeball')).toBeNull()
    expect(loadSetupState('beer_die')).toMatchObject({ picked: ['d1'] })
  })

  it('still reads a die pick saved before the split, under the old key', () => {
    window.localStorage.setItem('house-ladder-setup', JSON.stringify({ picked: ['old'], size: 3 }))
    expect(loadSetupState('beer_die')).toEqual({ picked: ['old'], size: 3 })
    expect(loadSetupState('spikeball')).toBeNull()
  })

  it('still reads a pick saved before there was a sport', () => {
    expect(isStoredSetupState({ picked: [], size: 3 })).toBe(true)
  })

  it('rejects a target the sport is not played to', () => {
    expect(isStoredSetupState({ picked: [], size: 2, sport: 'spikeball', target: 21 })).toBe(false)
    expect(isStoredSetupState({ picked: [], size: 2, sport: 'croquet' })).toBe(false)
    expect(isStoredSetupState({ picked: [], size: 3, target: 15 })).toBe(false)
  })
})

describe('the next game\'s target', () => {
  it('round-trips per session', () => {
    saveTarget('s1', 25)
    expect(loadTarget('s1', 'spikeball')).toBe(25)
    expect(loadTarget('s2', 'spikeball')).toBeNull()
  })

  it('ignores a stored target the sport does not allow', () => {
    saveTarget('s1', 25)
    expect(loadTarget('s1', 'beer_die')).toBeNull()
  })

  it('clears', () => {
    saveTarget('s1', 11)
    clearTarget('s1')
    expect(loadTarget('s1', 'spikeball')).toBeNull()
  })
})
