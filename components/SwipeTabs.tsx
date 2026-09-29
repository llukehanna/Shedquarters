'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SWIPE, classifySwipe, swipeTarget, type SwipeDirection } from '@/lib/ui/swipe'
import { DESKTOP_QUERY, matches } from '@/lib/ui/media'

/** With no tab on that side the page gives a little, then stops. */
const RUBBER_BAND = 0.2
const MAX_RUBBER_BAND = 48

/**
 * The swap after a swipe. The old page carries on off-screen at about the
 * finger's speed. The new one slides in from the far edge the moment it has
 * rendered, fast and settling hard (a quint ease-out). The old page always
 * outruns the new one, so they never overlap.
 */
const OUT_MS = { min: 140, max: 200 }
const OUT_EASE = 'cubic-bezier(0.2, 0.8, 0.4, 1)'
const IN_MS = 300
const IN_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const SNAP_BACK = 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)'

/** If the next page still hasn't rendered by then, show whatever is there (the navigation failed) rather than a blank screen. */
const NAV_TIMEOUT_MS = 2500

/** Touches here, or anything inside them, are never a tab swipe. */
const NO_SWIPE = '[data-no-swipe], input, textarea, select, [role="dialog"]'

/**
 * Swipe left or right anywhere on a tab to go to the next or previous one
 * (Ranks, Table, Me). The page follows the finger, then slides all the way
 * off as the next tab slides in beside it. Does nothing at desktop width,
 * where the rail is the navigation.
 *
 * The listeners are passive and never cancel the touch, so vertical scrolling
 * is untouched. A drag only counts once it is clearly sideways, and nothing
 * happens while a sheet or dialog is open.
 */
export function SwipeTabs({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  /** Set while a swipe is waiting for its page: where it left from, and which way it went. */
  const leaving = useRef<{ from: string; dir: SwipeDirection; animated: boolean } | null>(null)

  // The tabs either side, fetched ahead so a swipe lands straight away.
  useEffect(() => {
    for (const dir of ['left', 'right'] as const) {
      const target = swipeTarget(pathname, dir)
      if (target) router.prefetch(target)
    }
  }, [pathname, router])

  // The new tab has rendered (hidden, off to the side): bring it in.
  useEffect(() => {
    const swipe = leaving.current
    const el = ref.current
    if (swipe === null || swipe.from === pathname || !el) return
    leaving.current = null
    el.style.visibility = ''
    if (!swipe.animated) return
    const from = swipe.dir === 'left' ? window.innerWidth : -window.innerWidth
    el.animate([{ transform: `translate3d(${from}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], {
      duration: IN_MS,
      easing: IN_EASE,
    })
  }, [pathname])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const animated =
      typeof el.animate === 'function' && !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

    let start: { x: number; y: number; t: number } | null = null
    let axis: 'x' | 'y' | null = null

    function snapBack() {
      if (!el) return
      el.style.transition = SNAP_BACK
      el.style.transform = ''
    }

    function onStart(e: TouchEvent) {
      start = null
      axis = null
      if (e.touches.length !== 1 || leaving.current !== null) return
      // From lg up the rail is the navigation and the tab bar is gone, so a
      // touchscreen laptop or a landscape iPad doesn't swipe between tabs.
      if (matches(DESKTOP_QUERY)) return
      const target = e.target as Element | null
      if (target?.closest(NO_SWIPE) || document.querySelector('[role="dialog"]')) return
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, t: Date.now() }
    }

    function onMove(e: TouchEvent) {
      if (!start || !el) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (axis === null && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
        axis = Math.abs(dx) > SWIPE.straightness * Math.abs(dy) ? 'x' : 'y'
      }
      if (axis !== 'x' || !animated) return
      const hasTarget = swipeTarget(pathname, dx < 0 ? 'left' : 'right') !== null
      const shift = hasTarget ? dx : Math.max(-MAX_RUBBER_BAND, Math.min(MAX_RUBBER_BAND, dx * RUBBER_BAND))
      el.style.transition = 'none'
      el.style.transform = `translate3d(${shift}px, 0, 0)`
    }

    function onEnd(e: TouchEvent) {
      if (!start || !el) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const ms = Date.now() - start.t
      const direction =
        axis === 'y'
          ? null
          : classifySwipe({ dx, dy: t.clientY - start.y, ms, startX: start.x, width: window.innerWidth })
      start = null
      axis = null
      const target = direction ? swipeTarget(pathname, direction) : null
      if (!direction || !target) {
        snapBack()
        return
      }
      const swipe = { from: pathname, dir: direction, animated }
      leaving.current = swipe
      if (animated) slideAway(el, direction, dx, ms)
      window.setTimeout(() => {
        if (leaving.current !== swipe) return
        leaving.current = null
        el.style.visibility = ''
      }, NAV_TIMEOUT_MS)
      router.push(target)
    }

    function onCancel() {
      start = null
      axis = null
      snapBack()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
  }, [pathname, router])

  // The outer box clips the page while it's off to one side, so the document
  // never grows a sideways scroll. `clip` rather than `hidden`: it isn't a
  // scroll container, so the Table's sticky buttons still stick.
  return (
    <div className="overflow-x-clip">
      <div ref={ref} className={className}>
        {children}
      </div>
    </div>
  )
}

/**
 * The next tab replaces this page the moment its route renders, so the page
 * that's leaving goes as a copy: a static clone, fixed where the finger let
 * go, that slides off and is thrown away. The real page is hidden until the
 * new tab has rendered into it.
 */
function slideAway(el: HTMLDivElement, dir: SwipeDirection, dx: number, ms: number) {
  const width = window.innerWidth
  const toward = dir === 'left' ? -width : width
  const rect = el.getBoundingClientRect()

  // Keep up with the finger: the rest of the way at its speed, within bounds.
  const speed = Math.max(Math.abs(dx) / Math.max(ms, 1), 0.5)
  const remaining = Math.max(width - Math.abs(dx), 0)
  const duration = Math.round(Math.min(OUT_MS.max, Math.max(OUT_MS.min, (remaining / speed) * 2)))

  const ghost = document.createElement('div')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  Object.assign(ghost.style, {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left - dx}px`,
    width: `${rect.width}px`,
    pointerEvents: 'none',
    zIndex: '1',
  })
  const copy = el.cloneNode(true) as HTMLElement
  copy.style.transform = ''
  copy.style.transition = 'none'
  copy.style.visibility = ''
  ghost.appendChild(copy)
  document.body.appendChild(ghost)
  ghost
    .animate([{ transform: `translate3d(${dx}px, 0, 0)` }, { transform: `translate3d(${dx + toward}px, 0, 0)` }], {
      duration,
      easing: OUT_EASE,
    })
    .finished.catch(() => {})
    .finally(() => ghost.remove())

  el.style.transition = 'none'
  el.style.transform = ''
  el.style.visibility = 'hidden'
}
