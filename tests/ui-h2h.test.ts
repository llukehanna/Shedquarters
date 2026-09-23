import { describe, it, expect } from 'vitest'
import { buildH2hHref, firstParam } from '@/lib/ui/h2h'

describe('buildH2hHref', () => {
  it('selects a player into an empty slot', () => {
    expect(buildH2hHref({}, 'a', 'p1')).toBe('/h2h?a=p1')
  })

  it('keeps the other slot untouched when filling one', () => {
    expect(buildH2hHref({ b: 'p2' }, 'a', 'p1')).toBe('/h2h?a=p1&b=p2')
    expect(buildH2hHref({ a: 'p1' }, 'b', 'p2')).toBe('/h2h?a=p1&b=p2')
  })

  it('deselects when tapping the name already in that slot', () => {
    expect(buildH2hHref({ a: 'p1', b: 'p2' }, 'a', 'p1')).toBe('/h2h?b=p2')
    expect(buildH2hHref({ a: 'p1', b: 'p2' }, 'b', 'p2')).toBe('/h2h?a=p1')
  })

  it('replaces whatever was in a slot with a new pick', () => {
    expect(buildH2hHref({ a: 'p1', b: 'p2' }, 'a', 'p3')).toBe('/h2h?a=p3&b=p2')
  })

  it('returns the bare path when both slots end up empty', () => {
    expect(buildH2hHref({ a: 'p1' }, 'a', 'p1')).toBe('/h2h')
  })
})

describe('firstParam', () => {
  it('passes a plain string through', () => {
    expect(firstParam('p1')).toBe('p1')
  })

  it('takes the first value of a repeated query key', () => {
    expect(firstParam(['p1', 'p2'])).toBe('p1')
  })

  it('passes undefined through', () => {
    expect(firstParam(undefined)).toBeUndefined()
  })
})
