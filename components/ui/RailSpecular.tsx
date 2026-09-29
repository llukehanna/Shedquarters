'use client'

import { useEffect, useRef } from 'react'
import { FINE_POINTER_QUERY, REDUCED_MOTION_QUERY, matches } from '@/lib/ui/media'

/**
 * The rail's specular highlight, from lukeghanna.com: a soft light that
 * follows the cursor across the glass, and only across the rail. On a touch
 * screen or under reduced motion it adds no listener at all.
 */
export function RailSpecular({ className = '', children, ...rest }: React.ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null)
  // The highlight layer needs a positioned parent. A caller that already
  // positions it (the rail is `fixed`) must not also get `relative`: both
  // are `position` utilities, and Tailwind orders them by utility rather
  // than by string order, so `relative` could win.
  const positioned = /\b(fixed|absolute|sticky)\b/.test(className)

  useEffect(() => {
    const el = ref.current
    if (!el || !matches(FINE_POINTER_QUERY) || matches(REDUCED_MOTION_QUERY)) return
    function onMove(e: PointerEvent) {
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    el.addEventListener('pointermove', onMove)
    return () => el.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <div ref={ref} className={`${positioned ? '' : 'relative '}group/specular isolate ${className}`} {...rest}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[radial-gradient(240px_circle_at_var(--mx,50%)_var(--my,0%),color-mix(in_srgb,var(--fg)_8%,transparent),transparent)] opacity-0 transition-opacity duration-300 ease-(--ease) group-hover/specular:opacity-100"
      />
      {children}
    </div>
  )
}
