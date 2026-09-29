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

export type SidebarKey = 'ranks' | 'games' | 'h2h' | 'table' | 'me'

// The desktop rail. Games and H2H live inside the Ranks tab on a phone; with
// the width to spare they get their own entries. The index is the rail's mono
// number, the way lukeghanna.com numbers its sections.
export const SIDEBAR_LINKS: ReadonlyArray<{ key: SidebarKey; label: string; href: string; index: string }> = [
  { key: 'ranks', label: 'Ranks', href: '/', index: '01' },
  { key: 'games', label: 'Games', href: '/games', index: '02' },
  { key: 'h2h', label: 'H2H', href: '/h2h', index: '03' },
  { key: 'table', label: 'Table', href: '/table', index: '04' },
  { key: 'me', label: 'Me', href: '/roster', index: '05' },
]

function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** Which rail entry a pathname belongs to, or null where the rail should not show. */
export function sidebarKeyForPath(pathname: string): SidebarKey | null {
  if (pathname === '/' || pathname.startsWith('/players/')) return 'ranks'
  if (under(pathname, '/games')) return 'games'
  if (under(pathname, '/h2h')) return 'h2h'
  if (under(pathname, '/table')) return 'table'
  if (under(pathname, '/roster')) return 'me'
  return null
}
