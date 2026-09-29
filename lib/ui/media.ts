import { useSyncExternalStore } from 'react'

/** Tailwind's `lg`: from here up the rail replaces the tab bar. */
export const DESKTOP_QUERY = '(min-width: 1024px)'
/** A mouse or trackpad, as opposed to a finger. */
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Whether `query` matches right now. False on the server and wherever matchMedia is missing (jsdom). */
export function matches(query: string): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? false)
}

/**
 * The same, as a hook that re-renders when the answer changes. It is false on
 * the server, so use it only for something that appears after hydration (an
 * open sheet), never to choose a first-paint layout. That job belongs to CSS.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = typeof window === 'undefined' ? undefined : window.matchMedia?.(query)
      if (!list) return () => {}
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => matches(query),
    () => false,
  )
}
