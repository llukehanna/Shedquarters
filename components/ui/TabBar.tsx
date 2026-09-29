'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { TABS, tabForPath } from '@/lib/ui/nav'
import { SPORT_RULES } from '@/lib/domain/sport'
import { useLiveSports, useSport } from '@/components/SportContext'
import { LiveDot } from './LiveDot'

/**
 * The phone's navigation: a floating glass bar, the counterpart of the
 * desktop rail (hidden from lg up, where the rail takes over). The active tab
 * sits on the rail's active-row fill, which slides between tabs.
 */
export function TabBar() {
  const active = tabForPath(usePathname())
  const sport = useSport()
  const live = useLiveSports().includes(sport)
  if (active === null) return null

  return (
    <nav
      aria-label="Main"
      className="glass isolate fixed right-(--tabbar-x) bottom-(--tabbar-bottom) left-(--tabbar-x) z-30 mx-auto max-w-[26.5rem] rounded-full lg:hidden"
    >
      {/* Ground tint under the glass so labels stay legible over bright content. */}
      <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-[inherit] bg-ground-deep/75" />
      <ul className="flex h-16 p-1.5">
        {TABS.map((tab) => {
          const on = tab.key === active
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                // The whole page, not just its loading skeleton, fetched as
                // soon as the bar is on screen, so a tab switch never waits.
                prefetch={true}
                aria-current={on ? 'page' : undefined}
                className={`relative flex h-full items-center justify-center rounded-full font-display text-[12.5px] font-bold uppercase tracking-[0.12em] transition-colors duration-150 ease-(--ease) ${on ? 'text-accent' : 'text-faint active:text-fg'}`}
              >
                {on && (
                  <motion.span
                    layoutId="tab-indicator"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-fg/[6.5%] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--fg)_8%,transparent)]"
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {tab.label}
                  {tab.key === 'table' && live && <LiveDot label={`${SPORT_RULES[sport].name} night live`} />}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
