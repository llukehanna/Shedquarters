import { describe, it, expect } from 'vitest'
import { applyGame, applyPending, type Table } from '@/lib/domain/table'
import type { LogGameInput } from '@/lib/types'

const base: Table = { holders: ['h1', 'h2', 'h3'], challengers: ['c1', 'c2', 'c3'], runLength: 2, seq: 5 }

describe('applyGame', () => {
  it('extends the run and swaps in new challengers when the holders win', () => {
    const next = applyGame(base, 'holders', ['x1', 'x2', 'x3'])
    expect(next.holders).toEqual(base.holders)
    expect(next.challengers).toEqual(['x1', 'x2', 'x3'])
    expect(next.runLength).toBe(3)
    expect(next.seq).toBe(6)
  })

  it('promotes the challengers and resets the run on an upset', () => {
    const next = applyGame(base, 'challengers', ['x1', 'x2', 'x3'])
    expect(next.holders).toEqual(base.challengers)
    expect(next.runLength).toBe(1)
    expect(next.seq).toBe(6)
  })

  it('does not mutate its input', () => {
    applyGame(base, 'holders', ['x1', 'x2', 'x3'])
    expect(base.runLength).toBe(2)
    expect(base.seq).toBe(5)
  })
})

describe('applyPending', () => {
  it('folds queued games in order', () => {
    const q: LogGameInput[] = [
      { clientId: '1', sessionId: 's', winner: 'holders', loserScore: 10, nextChallengers: ['x1', 'x2', 'x3'] },
      { clientId: '2', sessionId: 's', winner: 'challengers', loserScore: 18, nextChallengers: ['y1', 'y2', 'y3'] },
    ]
    const out = applyPending(base, q)
    expect(out.holders).toEqual(['x1', 'x2', 'x3'])
    expect(out.runLength).toBe(1)
    expect(out.seq).toBe(7)
  })

  it('returns the base state for an empty queue', () => {
    expect(applyPending(base, [])).toEqual(base)
  })
})
