import { describe, expect, it } from 'vitest'
import { parseLogGameInput } from '@/lib/domain/validate'

const valid = {
  clientId: 'c1',
  sessionId: 's1',
  winner: 'holders',
  loserScore: 0,
  nextChallengers: ['p1', 'p2', 'p3'],
}

describe('parseLogGameInput', () => {
  it('returns a typed input for a well-formed body', () => {
    expect(parseLogGameInput(valid)).toEqual(valid)
  })

  it('accepts a challengers win and an empty challenger list', () => {
    expect(parseLogGameInput({ ...valid, winner: 'challengers', nextChallengers: [] })).toEqual({
      ...valid,
      winner: 'challengers',
      nextChallengers: [],
    })
  })

  it('strips unknown fields rather than passing them through to SQL', () => {
    expect(parseLogGameInput({ ...valid, voided: true, seq: 99 })).toEqual(valid)
  })

  it.each([
    ['a non-object', 'nope'],
    ['null', null],
    ['an array', [valid]],
    ['an empty clientId', { ...valid, clientId: '' }],
    ['an empty sessionId', { ...valid, sessionId: '' }],
    ['a mis-cased winner', { ...valid, winner: 'Holders' }],
    ['a boolean winner', { ...valid, winner: true }],
    ['a fractional loserScore', { ...valid, loserScore: 1.5 }],
    ['a negative loserScore', { ...valid, loserScore: -1 }],
    ['a NaN loserScore', { ...valid, loserScore: Number.NaN }],
    ['a stringly-typed loserScore', { ...valid, loserScore: '12' }],
    ['nextChallengers as a string', { ...valid, nextChallengers: 'p1' }],
    ['nextChallengers holding null', { ...valid, nextChallengers: [null] }],
  ])('throws on %s', (_label, body) => {
    expect(() => parseLogGameInput(body)).toThrow(/invalid request body/)
  })
})
