'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { SPORTS, SPORT_RULES, type Sport } from '@/lib/domain/sport'
import { useLiveSports, useSport } from '@/components/SportContext'
import { SportIcon } from './SportIcon'

const LABEL: Record<Sport, string> = { beer_die: 'Die', spikeball: 'Spike' }

/**
 * The Die │ Spike switch in the top bar. Each half links to this same page
 * (search params kept) with `?sport=`, which `proxy.ts` turns into the cookie
 * before redirecting back without it.
 *
 * Plain `<a>`, not `next/link`, on purpose: a client-side navigation would not
 * re-render the root layout, and the root layout is what paints the theme
 * (`<html data-sport>`). A full load always comes back fully in the new sport.
 */
export function SportPill() {
  const sport = useSport()
  const live = useLiveSports()
  const pathname = usePathname()
  const search = useSearchParams()

  function href(s: Sport): string {
    const params = new URLSearchParams(search.toString())
    params.delete('sport')
    params.set('sport', s)
    return `${pathname}?${params.toString()}`
  }

  return (
    <nav aria-label="Game" className="flex gap-0.5 rounded-full border border-accent/15 bg-fg/5 p-[3px]">
      {SPORTS.map((s) => {
        const on = s === sport
        return (
          <a
            key={s}
            href={href(s)}
            aria-current={on ? 'page' : undefined}
            aria-label={SPORT_RULES[s].name}
            className={`relative flex h-[30px] items-center gap-[5px] rounded-full px-2.5 font-display text-[14px] font-extrabold uppercase italic tracking-[0.04em] ${on ? 'bg-accent text-accent-ink' : 'text-muted'}`}
          >
            <SportIcon sport={s} size={15} />
            {LABEL[s]}
            {!on && live.includes(s) && (
              <span
                role="img"
                aria-label={`${SPORT_RULES[s].name} night live`}
                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-up"
              />
            )}
          </a>
        )
      })}
    </nav>
  )
}
