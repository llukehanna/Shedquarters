export type TabKey = 'ranks' | 'table' | 'me'

// The Me tab points at the roster until plan 2 adds identity and /me.
export const TABS: ReadonlyArray<{ key: TabKey; label: string; href: string }> = [
  { key: 'ranks', label: 'Ranks', href: '/' },
  { key: 'table', label: 'Table', href: '/table' },
  { key: 'me', label: 'Me', href: '/roster' },
]

/** Which tab a pathname belongs to, or null where the tab bar should not show. */
export function tabForPath(pathname: string): TabKey | null {
  if (
    pathname === '/' ||
    pathname.startsWith('/players/') ||
    pathname === '/games' ||
    pathname.startsWith('/games/') ||
    pathname === '/h2h' ||
    pathname.startsWith('/h2h/')
  )
    return 'ranks'
  if (pathname === '/table' || pathname.startsWith('/table/')) return 'table'
  if (pathname === '/roster' || pathname.startsWith('/roster/')) return 'me'
  return null
}
