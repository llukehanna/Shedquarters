import { describe, it, expect } from 'vitest'
import { tabForPath, TABS } from '@/lib/ui/nav'

describe('tabForPath', () => {
  it('maps the leaderboard and player pages to Ranks', () => {
    expect(tabForPath('/')).toBe('ranks')
    expect(tabForPath('/players/2f1c')).toBe('ranks')
  })

  it('maps the game log to Ranks so the tab bar still highlights sensibly', () => {
    expect(tabForPath('/games')).toBe('ranks')
    expect(tabForPath('/games/anything')).toBe('ranks')
  })

  it('maps the head-to-head page to Ranks so the tab bar still shows', () => {
    expect(tabForPath('/h2h')).toBe('ranks')
    expect(tabForPath('/h2h/anything')).toBe('ranks')
  })

  it('maps the table to Table', () => {
    expect(tabForPath('/table')).toBe('table')
  })

  it('maps the roster to Me until plan 2 adds /me', () => {
    expect(tabForPath('/roster')).toBe('me')
  })

  it('returns null where the tab bar must not show', () => {
    expect(tabForPath('/gate')).toBeNull()
    expect(tabForPath('/players')).toBeNull()
  })

  it('does not match on a shared prefix', () => {
    expect(tabForPath('/tables')).toBeNull()
    expect(tabForPath('/rosterx')).toBeNull()
    expect(tabForPath('/h2hx')).toBeNull()
  })
})

describe('TABS', () => {
  it('is exactly Ranks, Table, Me in order', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Ranks', 'Table', 'Me'])
    expect(TABS.map((t) => t.href)).toEqual(['/', '/table', '/roster'])
  })
})
