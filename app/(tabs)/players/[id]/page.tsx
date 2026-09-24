import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRatings } from '@/lib/ratings-cache'
import { getPlayers, getGameLogAll } from '@/lib/queries'
import { headToHead, liveGames, pointDifferentialFromLive } from '@/lib/domain/stats'
import { earnedBadgesFromLive } from '@/lib/domain/badges'
import { TopBar } from '@/components/ui/TopBar'
import { Pill } from '@/components/ui/Pill'
import { PlayerBadges } from '@/components/ui/PlayerBadges'
import { SPORT_RULES } from '@/lib/domain/sport'
import { currentSport } from '@/lib/sport-cookie'
import { formatRating, formatRecord, formatPercent, countLabel, formatDiff, formatDiffAverage } from '@/lib/ui/format'

export const dynamic = 'force-dynamic'

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sport = await currentSport()
  // getGameLogAll() rather than getGames(): same rows, plus the timestamp
  // the Ghost badge needs. Everything else on this page takes a GameRecord
  // and is unaffected by the extra column, so this stays one query.
  const [ratings, players, games] = await Promise.all([
    getRatings(sport),
    getPlayers(),
    getGameLogAll(sport),
  ])
  const me = players.find((p) => p.id === id)
  if (!me) notFound()

  const index = ratings.findIndex((r) => r.playerId === id)
  const rating = index >= 0 ? ratings[index] : undefined
  // Sort/filter the history once and hand the shared list to both per-player
  // computations, the way the rankings page does — rather than each of them
  // re-sorting the whole table for itself.
  const live = liveGames(games)
  const diff = pointDifferentialFromLive(live, id)
  const badges = earnedBadgesFromLive(live, id, new Date())

  const records = players
    .filter((p) => p.id !== id)
    .map((p) => ({ p, h: headToHead(games, id, p.id) }))
    .filter(({ h }) => h.wins + h.losses > 0)
    .sort((a, b) => b.h.wins + b.h.losses - (a.h.wins + a.h.losses))

  return (
    <main>
      <TopBar right={<Link href="/" className="eyebrow text-fg">← Ranks</Link>} />

      <section className="panel relative mt-2 overflow-hidden rounded-2xl p-4">
        {rating && (
          <span aria-hidden className="headline absolute top-1 right-3 text-[78px] text-accent/20">
            #{index + 1}
          </span>
        )}
        <p className="eyebrow text-accent">
          {rating ? `No. ${index + 1}` : me.isHousemate ? 'Housemate' : 'Guest'}
        </p>
        <h1 className="headline mt-1 text-[50px]">{me.displayName}</h1>
        {me.nicknames.length > 0 && (
          <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[14px] text-fg/70">
            {me.nicknames.map((n) => (
              <span key={n}>&ldquo;{n}&rdquo;</span>
            ))}
          </p>
        )}
        {rating ? (
          <p className="mt-2 font-mono text-[30px] font-bold">
            {formatRating(rating.ordinal)}
            <span className="ml-2 font-body text-[11px] font-semibold text-fg/80">rating</span>
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-fg/80">
            No {SPORT_RULES[sport].name.toLowerCase()} games logged yet.
          </p>
        )}
      </section>

      {rating && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Stat value={formatRecord(rating.wins, rating.games)} label="Record" />
          <Stat
            value={rating.games > 0 ? formatPercent(rating.wins / rating.games) : '—'}
            label={countLabel(rating.games, 'game')}
          />
          <Stat
            value={formatDiff(diff.total)}
            label="Point diff"
            sub={diff.average !== null ? `${formatDiffAverage(diff.average)}/gm` : undefined}
            tone={diff.total > 0 ? 'up' : diff.total < 0 ? 'down' : undefined}
            mono
          />
          <Stat value={rating.provisional ? 'Yes' : 'No'} label="Provisional" accent={rating.provisional} />
        </div>
      )}


      <PlayerBadges badges={badges} />

      <section className="mt-5">
        <h2 className="mb-2 flex items-baseline justify-between">
          <span className="eyebrow">Head to head</span>
          <Link href={`/h2h?a=${id}`} className="eyebrow flex min-h-11 items-center text-accent">
            vs someone →
          </Link>
        </h2>
        {records.length === 0 ? (
          <p className="surface rounded-2xl px-3 py-4 text-[13px] text-muted">
            No head-to-head games logged yet.
          </p>
        ) : (
          <ul className="surface rounded-2xl px-3">
            {records.map(({ p, h }) => (
              <li key={p.id} className="flex min-h-11 items-center border-b border-accent/8 last:border-b-0">
                <Link href={`/players/${p.id}`} className="flex min-h-11 flex-1 items-center self-stretch font-display text-[17px] font-bold uppercase">
                  {p.displayName}
                </Link>
                {h.wins > h.losses && <Pill tone="accent">Owns</Pill>}
                <span
                  className={`ml-3 font-mono text-[14px] font-bold ${h.wins >= h.losses ? 'text-up' : 'text-down'}`}
                >
                  {h.wins}–{h.losses}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function Stat({
  value,
  label,
  sub,
  accent = false,
  tone,
  mono = false,
}: {
  value: string
  label: string
  sub?: string
  accent?: boolean
  tone?: 'up' | 'down'
  mono?: boolean
}) {
  const toneClass = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : accent ? 'text-accent' : ''
  return (
    <div className="surface rounded-[10px] px-2.5 py-2">
      <p
        className={`${mono ? 'font-mono' : 'font-display'} text-[23px] leading-none font-extrabold ${toneClass}`}
      >
        {value}
      </p>
      <p className="eyebrow mt-1 text-[10px]">{label}</p>
      {sub && <p className="mt-0.5 font-mono text-[9px] text-muted">{sub}</p>}
    </div>
  )
}
