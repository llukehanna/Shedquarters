import { SPORT_RULES, type Sport } from '@/lib/domain/sport'
import type { SportSummary } from '@/lib/domain/player-summary'
import { formatDiff, formatPercent, formatRating, formatStreak } from '@/lib/ui/format'
import { PlayerBadges } from './PlayerBadges'
import { Pill } from './Pill'
import { SportIcon } from './SportIcon'

/**
 * One sport's card on a player's page, in that sport's own colours: the
 * `data-sport` wrapper re-scopes the theme, so the page around it can be
 * neutral while die's card is flag red and spikeball's is yellow.
 */
export function SportCard({ sport, summary }: { sport: Sport; summary: SportSummary }) {
  const name = SPORT_RULES[sport].name

  if (summary.played === 0 || summary.rating === null) {
    return (
      <section
        data-sport={sport}
        className="mt-3 flex min-h-16 items-center gap-2.5 rounded-2xl border border-dashed border-accent/40 px-4 text-accent"
      >
        <SportIcon sport={sport} size={18} />
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em]">
          No {name.toLowerCase()} games yet
        </span>
      </section>
    )
  }

  const { rating, rank, streak, diff } = summary
  return (
    <div data-sport={sport}>
      <section className="panel relative mt-3 overflow-hidden rounded-2xl p-4">
        <span aria-hidden className="headline absolute top-1 right-3 text-[76px] text-panel-ink/20">
          #{rank}
        </span>
        <p className="eyebrow flex items-center gap-2 text-panel-sub">
          <SportIcon sport={sport} size={18} />
          {name}
          {rating.provisional && <Pill tone="onPanelDim">Provisional</Pill>}
        </p>
        <p className="mt-1.5 flex items-baseline gap-2.5">
          <span className="font-mono text-[38px] leading-none font-bold">{formatRating(rating.ordinal)}</span>
          <span className="eyebrow text-panel-sub">rating · #{rank} in the house</span>
        </p>
        <dl className="mt-3.5 grid grid-cols-4 gap-2">
          <Cell label="Record" value={`${summary.wins}–${summary.losses}`} />
          <Cell label="Win %" value={summary.winRate === null ? '—' : formatPercent(summary.winRate)} />
          <Cell label="Streak" value={streak ? formatStreak(streak) : '—'} />
          <Cell label="Pt diff" value={formatDiff(diff.total)} />
        </dl>
      </section>
      <PlayerBadges badges={summary.badges} title={`${name} badges`} />
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="eyebrow text-[10.5px] text-panel-sub">{label}</dt>
      <dd className="font-mono text-[19px] leading-none font-bold">{value}</dd>
    </div>
  )
}
