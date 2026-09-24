import Link from 'next/link'
import { SPORTS, SPORT_RULES, withSport, type Sport } from '@/lib/domain/sport'

/**
 * Which ladder a page is showing. Plain links, so the pages stay server
 * components driven entirely by `?sport=`. `path` is the page's own path,
 * including any other query it needs to keep (the head-to-head picks).
 */
export function SportSwitch({ sport, path }: { sport: Sport; path: string }) {
  return (
    <nav aria-label="Game" className="mb-4 flex overflow-hidden rounded-[9px] border border-gold/15">
      {SPORTS.map((s) => {
        const on = s === sport
        return (
          <Link
            key={s}
            href={withSport(path, s)}
            aria-current={on ? 'page' : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center font-display text-[15px] font-extrabold uppercase ${on ? 'bg-gold text-gold-ink' : 'text-cream'}`}
          >
            {SPORT_RULES[s].name}
          </Link>
        )
      })}
    </nav>
  )
}

/** The same choice as a button group, for the table's setup screen, where nothing is a URL. */
export function SportToggle({ sport, onChange }: { sport: Sport; onChange: (sport: Sport) => void }) {
  return (
    <div role="group" aria-label="Game" className="flex overflow-hidden rounded-[9px] border border-gold/15">
      {SPORTS.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === sport}
          onClick={() => {
            if (s !== sport) onChange(s)
          }}
          className={`min-h-11 flex-1 font-display text-[15px] font-extrabold uppercase ${s === sport ? 'bg-gold text-gold-ink' : 'text-cream'}`}
        >
          {SPORT_RULES[s].name}
        </button>
      ))}
    </div>
  )
}

/** "Game to 25 / 15 / 11". Only rendered for a sport with more than one target. */
export function TargetToggle({
  sport,
  target,
  onChange,
}: {
  sport: Sport
  target: number
  onChange: (target: number) => void
}) {
  const targets = SPORT_RULES[sport].targets
  if (targets.length < 2) return null
  return (
    <div className="flex items-center gap-3">
      <span className="eyebrow shrink-0">Game to</span>
      <div role="group" aria-label="Game to" className="flex flex-1 overflow-hidden rounded-[9px] border border-gold/15">
        {targets.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={t === target}
            onClick={() => {
              if (t !== target) onChange(t)
            }}
            className={`min-h-11 flex-1 font-mono text-[17px] font-bold ${t === target ? 'bg-gold text-gold-ink' : 'text-cream'}`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
