import { SPORT_RULES, type Sport } from '@/lib/domain/sport'

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
      <div role="group" aria-label="Game to" className="flex flex-1 overflow-hidden rounded-[9px] border border-accent/15">
        {targets.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={t === target}
            onClick={() => {
              if (t !== target) onChange(t)
            }}
            className={`min-h-11 flex-1 font-mono text-[17px] font-bold ${t === target ? 'bg-accent text-accent-ink' : 'text-fg'}`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
