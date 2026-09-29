import Link from 'next/link'
import type { Player } from '@/lib/queries'
import { Pill } from '@/components/ui/Pill'

/**
 * The roster on the Me tab. Each name opens that player's profile, which is
 * also where a signed-in phone renames them or adds nicknames.
 */
export function RosterList({ players }: { players: Player[] }) {
  return (
    <ul className="surface mt-4 rounded-2xl px-3">
      {players.map((p) => (
        <li key={p.id} className="border-b border-accent/8 last:border-b-0">
          <Link href={`/players/${p.id}`} className="flex min-h-11 items-center gap-3 py-1">
            <span className="flex-1">
              <span className="block font-display text-[17px] font-bold uppercase">{p.displayName}</span>
              {p.nicknames.length > 0 && (
                <span className="block text-[12px] text-fg/60">
                  {p.nicknames.map((n) => `“${n}”`).join(' · ')}
                </span>
              )}
            </span>
            {!p.isHousemate && <Pill tone="dim">Guest</Pill>}
            <span aria-hidden className="text-accent">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
