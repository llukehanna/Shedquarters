'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { TABS, tabForPath } from '@/lib/ui/nav'

export function TabBar() {
  const active = tabForPath(usePathname())
  if (active === null) return null

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/15 bg-ink-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-16 max-w-md">
        {TABS.map((tab) => {
          const on = tab.key === active
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                aria-current={on ? 'page' : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 font-display text-[12.5px] font-bold uppercase tracking-[0.12em] ${on ? 'text-gold' : 'text-faint'}`}
              >
                <span className="relative h-[3px] w-5">
                  {on && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-full bg-gold"
                    />
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
