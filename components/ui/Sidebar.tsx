'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SIDEBAR_LINKS, sidebarKeyForPath } from '@/lib/ui/nav'
import { SPORT_RULES } from '@/lib/domain/sport'
import { useLiveSports, useSport } from '@/components/SportContext'
import { LiveDot } from './LiveDot'
import { RailSpecular } from './RailSpecular'
import { SportPill } from './SportPill'
import { Wordmark } from './Wordmark'

/**
 * The desktop rail, after lukeghanna.com's: a floating glass card down the
 * left with the wordmark, the Die │ Spike pill where the site keeps its theme
 * toggle, numbered links, and whether tonight is on. From lg up it replaces
 * the tab bar.
 */
export function Sidebar() {
  const current = sidebarKeyForPath(usePathname())
  const sport = useSport()
  const live = useLiveSports().includes(sport)
  if (current === null) return null

  return (
    <RailSpecular className="glass fixed top-6 bottom-6 left-6 z-30 hidden w-[280px] rounded-2xl lg:block">
      <div className="absolute top-[18px] right-[18px] z-10">
        <SportPill />
      </div>
      <nav aria-label="Main" className="scroll-quiet flex h-full flex-col overflow-y-auto px-[34px] pt-9 pb-7">
        <div className="mt-11">
          <Wordmark variant="stacked" size={52} />
        </div>
        <p className="mt-3.5 text-[14px] leading-normal text-muted">
          <span className="font-semibold text-fg">The house ladder.</span> Winners stay on, every game counts. Est.
          2026.
        </p>

        <ul className="mt-9 flex flex-col gap-1">
          {SIDEBAR_LINKS.map((link) => {
            const on = link.key === current
            return (
              <li key={link.key}>
                <Link
                  href={link.href}
                  aria-current={on ? 'page' : undefined}
                  className={`-mx-3 flex items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-[14px] font-medium transition-colors duration-250 ease-(--ease) ${
                    on
                      ? 'bg-fg/[6.5%] text-fg shadow-[inset_0_1px_0_color-mix(in_srgb,var(--fg)_8%,transparent)]'
                      : 'text-muted hover:bg-fg/5 hover:text-fg'
                  }`}
                >
                  {link.label}
                  {link.key === 'table' && live && <LiveDot label={`${SPORT_RULES[sport].name} night live`} />}
                  <span aria-hidden="true" className="ml-auto font-mono text-[11px] text-faint">
                    {link.index}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mt-auto flex justify-between border-t border-fg/9 pt-3.5 font-mono text-[11px] tracking-[0.04em] text-faint">
          <span>{SPORT_RULES[sport].name}</span>
          {live ? <span className="text-up">
              <span aria-hidden="true">●</span> Live
            </span> : <span>No night on</span>}
        </div>
      </nav>
    </RailSpecular>
  )
}
