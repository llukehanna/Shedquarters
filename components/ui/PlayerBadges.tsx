import { badgeViews } from '@/lib/ui/badges'
import type { Badge } from '@/lib/domain/badges'

/**
 * The badge shelf on a player profile: one small badge per row, each with
 * the one line that says what it took to get it — a badge nobody can read
 * is just a sticker. Every string comes from `badgeViews`; nothing is
 * composed here.
 *
 * An empty list renders nothing at all. There is deliberately no "no badges
 * yet" state: a blank shelf on a profile would read as a scoreboard saying
 * you are bad at this, which is not the joke.
 */
export function PlayerBadges({ badges }: { badges: Badge[] }) {
  const views = badgeViews(badges)
  if (views.length === 0) return null

  return (
    <section className="mt-5">
      <h2 className="eyebrow mb-2">Badges</h2>
      <ul className="surface rounded-2xl px-3">
        {views.map((v) => (
          <li
            key={v.kind}
            className="flex items-start gap-3 border-b border-accent/8 py-2.5 last:border-b-0"
          >
            {/* min-width, not a fixed width: the patches line up at the
                common case but the longest name plus a two-digit tally
                ("Heartbreaker ×12") is wider than any tidy fixed box, and
                the text must never run through the gold hairline. */}
            <span className="flex min-w-[104px] shrink-0 items-center justify-center gap-1 rounded-[4px] border border-accent/45 bg-accent/10 px-2 py-[3px] font-display text-[11px] font-extrabold tracking-[0.08em] text-accent uppercase">
              <span>{v.name}</span>
              {v.count !== null && <span className="font-mono">{v.count}</span>}
            </span>
            <span className="flex-1 text-[12.5px] leading-snug text-muted">{v.blurb}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
