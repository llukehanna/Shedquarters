'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SWIPE, classifySwipe, swipeTarget } from '@/lib/ui/swipe'

// How far the page follows a finger: a hint that the swipe is being read, not
// a full page drag. Less again when there is no tab on that side.
const FOLLOW = 0.35
const FOLLOW_AT_END = 0.12
const MAX_FOLLOW = 90

/** Touches here, or anything inside them, are never a tab swipe. */
const NO_SWIPE = '[data-no-swipe], input, textarea, select, [role="dialog"]'

/**
 * Swipe left or right anywhere on a tab to go to the next or previous one
 * (Ranks, Table, Me). The listeners are passive and never cancel the touch, so
 * vertical scrolling is untouched. A drag only counts once it is clearly
 * sideways, and nothing happens while a sheet or dialog is open.
 */
export function SwipeTabs({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  // The tabs either side, fetched ahead so a swipe lands straight away.
  useEffect(() => {
    for (const dir of ['left', 'right'] as const) {
      const target = swipeTarget(pathname, dir)
      if (target) router.prefetch(target)
    }
  }, [pathname, router])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    let start: { x: number; y: number; t: number } | null = null
    let axis: 'x' | 'y' | null = null

    function settle() {
      if (!el) return
      el.style.transition = 'transform 180ms ease-out'
      el.style.transform = ''
    }

    function onStart(e: TouchEvent) {
      start = null
      axis = null
      if (e.touches.length !== 1) return
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
      if (axis !== 'x' || reduced) return
      const hasTarget = swipeTarget(pathname, dx < 0 ? 'left' : 'right') !== null
      const shift = Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, dx * (hasTarget ? FOLLOW : FOLLOW_AT_END)))
      el.style.transition = 'none'
      el.style.transform = `translateX(${shift}px)`
    }

    function onEnd(e: TouchEvent) {
      if (!start) return
      const t = e.changedTouches[0]
      const direction =
        axis === 'y'
          ? null
          : classifySwipe({
              dx: t.clientX - start.x,
              dy: t.clientY - start.y,
              ms: Date.now() - start.t,
              startX: start.x,
              width: window.innerWidth,
            })
      start = null
      axis = null
      settle()
      const target = direction ? swipeTarget(pathname, direction) : null
      if (target) router.push(target)
    }

    function onCancel() {
      start = null
      axis = null
      settle()
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

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
