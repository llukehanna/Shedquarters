import { TABS, tabForPath } from '@/lib/ui/nav'

export type SwipeDirection = 'left' | 'right'

/**
 * Where a sideways swipe goes: left to the next tab, right to the previous,
 * in tab-bar order (Ranks, Table, Me). No wrapping at either end. A page inside
 * a tab (a player, the game log) counts as that tab. Null off the tabs.
 */
export function swipeTarget(pathname: string, direction: SwipeDirection): string | null {
  const tab = tabForPath(pathname)
  if (tab === null) return null
  const i = TABS.findIndex((t) => t.key === tab)
  const next = TABS[direction === 'left' ? i + 1 : i - 1]
  return next ? next.href : null
}

/** How far, how straight and how quick a swipe has to be. */
export const SWIPE = { minDistance: 70, straightness: 1.8, maxMs: 700, edge: 24 } as const

/**
 * Whether a finished touch was a swipe, and which way. It has to be clearly
 * sideways (so scrolling never changes tab), far enough, and quick. It must
 * start away from the screen edges, which belong to the phone's own back
 * gesture.
 */
export function classifySwipe(g: { dx: number; dy: number; ms: number; startX: number; width: number }): SwipeDirection | null {
  if (g.startX < SWIPE.edge || g.startX > g.width - SWIPE.edge) return null
  if (Math.abs(g.dx) < SWIPE.minDistance) return null
  if (Math.abs(g.dx) <= SWIPE.straightness * Math.abs(g.dy)) return null
  if (g.ms > SWIPE.maxMs) return null
  return g.dx < 0 ? 'left' : 'right'
}
