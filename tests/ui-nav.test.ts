import { describe, it, expect } from 'vitest'
import { tabForPath, TABS, sidebarKeyForPath, SIDEBAR_LINKS } from '@/lib/ui/nav'

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

describe('sidebarKeyForPath', () => {
  it('maps the leaderboard and player pages to Ranks', () => {
    expect(sidebarKeyForPath('/')).toBe('ranks')
    expect(sidebarKeyForPath('/players/2f1c')).toBe('ranks')
  })

  it('gives the game log and head-to-head their own entries', () => {
    expect(sidebarKeyForPath('/games')).toBe('games')
    expect(sidebarKeyForPath('/games/anything')).toBe('games')
    expect(sidebarKeyForPath('/h2h')).toBe('h2h')
    expect(sidebarKeyForPath('/h2h/anything')).toBe('h2h')
  })

  it('maps the table and the roster', () => {
    expect(sidebarKeyForPath('/table')).toBe('table')
    expect(sidebarKeyForPath('/roster')).toBe('me')
  })

  it('returns null off the tabs', () => {
    expect(sidebarKeyForPath('/gate')).toBeNull()
    expect(sidebarKeyForPath('/who')).toBeNull()
    expect(sidebarKeyForPath('/players')).toBeNull()
  })

  it('does not match on a shared prefix', () => {
    expect(sidebarKeyForPath('/gamesx')).toBeNull()
    expect(sidebarKeyForPath('/h2hx')).toBeNull()
    expect(sidebarKeyForPath('/tables')).toBeNull()
  })
})

describe('SIDEBAR_LINKS', () => {
  it('is Ranks, Games, H2H, Table, Me, numbered 01 to 05', () => {
    expect(SIDEBAR_LINKS.map((l) => l.label)).toEqual(['Ranks', 'Games', 'H2H', 'Table', 'Me'])
    expect(SIDEBAR_LINKS.map((l) => l.href)).toEqual(['/', '/games', '/h2h', '/table', '/roster'])
    expect(SIDEBAR_LINKS.map((l) => l.index)).toEqual(['01', '02', '03', '04', '05'])
  })
})
