import Link from 'next/link'
import { getRatings } from '@/lib/ratings-cache'
import { getPlayers, getGameLogAll } from '@/lib/queries'
import { getActiveTable } from '@/lib/session'
import { longestRuns, mostCarried, liveGames, pointDifferentialFromLive, currentStreakFromLive } from '@/lib/domain/stats'
import { computeMovement } from '@/lib/domain/movement'
import { shedOfShame, type ShameEntry } from '@/lib/domain/shame'
import { PROVISIONAL_GAMES } from '@/lib/domain/ratings'
import { TopBar } from '@/components/ui/TopBar'
import { RankRow } from '@/components/ui/RankRow'
import { InstallHint } from '@/components/InstallHint'
import { SportSwitch } from '@/components/ui/SportSwitch'
import { SPORT_RULES, parseSport, withSport } from '@/lib/domain/sport'
import { formatRating, formatRecord, formatPercent, formatDiff, countLabel } from '@/lib/ui/format'

export const dynamic = 'force-dynamic'

const SHAME_LABELS: Record<ShameEntry['slot'], string> = {
  skid: 'On the skid',
  diff: 'Doormat',
  cursed: 'Cursed',
}

export default async function Ranks({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string | string[] }>
}) {
  const sport = parseSport((await searchParams).sport)
  const [ratings, players, games, table] = await Promise.all([
    getRatings(sport),
    getPlayers(),
    // Unbounded: longestRuns/mostCarried/movement/shame all need the full
    // history, not the game-log page's usual cap. getGameLogAll() is its
    // own query (same row shape as getGameLog(), just no limit/truncation
    // to misuse) — getGames() stays untouched for the ratings cache and
    // lib/domain/stats's other callers.
    getGameLogAll(sport),
    getActiveTable(),
  ])
  const name = (id: string) => players.find((p) => p.id === id)?.displayName ?? '?'
  const runs = longestRuns(games).slice(0, 3)
  const carried = mostCarried(games).slice(0, 3)
  const played = games.filter((g) => !g.voided).length

  // Sort/filter once and hand the shared list to every per-player
  // computation below, instead of each one re-sorting the full history.
  const live = liveGames(games)
  const streaksById = new Map(ratings.map((r) => [r.playerId, currentStreakFromLive(live, r.playerId)]))

  // getRatings() already replayed the full history (and cached it) — reuse
  // that instead of a second full computeRatings() call for the "now" side
  // of the movement comparison. Only the "before" snapshot needs its own
  // replay, and it's a small one (games older than the cutoff).
  const currentRatingsById = new Map(ratings.map((r) => [r.playerId, r]))
  const movement = computeMovement(games, currentRatingsById)

  const shame = shedOfShame(
    ratings.map((r) => ({
      playerId: r.playerId,
      ordinal: r.ordinal,
      provisional: r.provisional,
      games: r.games,
      streak: streaksById.get(r.playerId) ?? null,
      differentialTotal: pointDifferentialFromLive(live, r.playerId).total,
    })),
  )
  const shameEntries = shame.map((entry) => ({
    key: entry.slot,
    label: SHAME_LABELS[entry.slot],
    name: name(entry.playerId),
    value:
      entry.slot === 'skid'
        ? `L${entry.streakLength}`
        : entry.slot === 'diff'
          ? formatDiff(entry.total)
          : formatRating(entry.ordinal),
  }))

  return (
    <main>
      <TopBar live={table !== null} />
      <InstallHint />

      <h1 className="headline mt-2 text-[52px]">
        Power
        <br />
        <span className="text-gold">Rankings</span>
      </h1>
      <p className="eyebrow mt-2 mb-4">
        {SPORT_RULES[sport].name} · {countLabel(played, 'game')}
      </p>

      <SportSwitch sport={sport} path="/" />

      {ratings.length === 0 ? (
        <section className="mt-12 text-center">
          <p className="headline text-[104px] text-gold">0</p>
          <p className="eyebrow mt-2">Games played</p>
          <h2 className="headline mt-6 text-[36px]">
            Season starts <span className="text-gold">tonight</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xs text-[14px] leading-relaxed text-muted">
            Log games at the table. Rankings show up after the first game and firm up once people
            hit {PROVISIONAL_GAMES}.
          </p>
          <Link
            href="/table"
            className="mt-8 flex min-h-14 items-center justify-center rounded-xl bg-gradient-to-br from-cardinal-glow to-cardinal-shade font-display text-[23px] font-extrabold italic uppercase text-white shadow-[inset_0_0_0_1px_rgb(255_204_0/0.35)]"
          >
            Go to the table →
          </Link>
        </section>
      ) : (
        <ol>
          {ratings.map((r, i) => (
            <li key={r.playerId}>
              <RankRow
                rank={i + 1}
                name={name(r.playerId)}
                rating={formatRating(r.ordinal)}
                record={formatRecord(r.wins, r.games)}
                href={withSport(`/players/${r.playerId}`, sport)}
                first={i === 0}
                provisional={r.provisional}
                streak={streaksById.get(r.playerId) ?? null}
                movement={movement.get(r.playerId) ?? null}
              />
            </li>
          ))}
        </ol>
      )}

      {runs.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow mb-2">Longest runs</h2>
          <ul className="surface rounded-2xl px-3">
            {runs.map((r, i) => (
              <li key={i} className="flex min-h-11 items-center border-b border-gold/8 last:border-b-0">
                <span className="w-7 font-display text-[18px] font-extrabold text-gold">{i + 1}</span>
                <span className="flex-1 font-display text-[17px] font-bold uppercase">
                  {r.roster.map(name).join(' · ')}
                </span>
                <span className="headline text-[26px] text-gold">{r.length}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {carried.length > 0 && (
        <section className="mt-6">
          <h2 className="eyebrow mb-2">Most carried</h2>
          <ul className="surface rounded-2xl px-3 py-1">
            {carried.map((c, i) => (
              <li key={i} className="border-b border-gold/8 py-2.5 text-[13.5px] leading-snug last:border-b-0">
                <span className="font-display text-[17px] font-bold uppercase">{name(c.playerId)}</span>{' '}
                wins <b className="text-gold">{formatPercent(c.withRate)}</b> with {name(c.teammateId)} (
                {countLabel(c.withGames, 'game')}), {formatPercent(c.withoutRate)} without (
                {c.withoutGames})
              </li>
            ))}
          </ul>
        </section>
      )}

      {shameEntries.length > 0 && (
        <section className="mt-6">
          <h2 className="eyebrow mb-2">Shed of shame</h2>
          <ul className="surface rounded-2xl px-3">
            {shameEntries.map((e) => (
              <li
                key={e.key}
                className="flex min-h-11 items-center gap-3 border-b border-gold/8 py-2 last:border-b-0"
              >
                <span className="w-[104px] shrink-0 text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-muted">
                  {e.label}
                </span>
                <span className="flex-1 truncate font-display text-[17px] font-bold uppercase">
                  {e.name}
                </span>
                <span className="font-mono text-[16px] font-bold text-down">{e.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href={withSport('/games', sport)}
        className="surface mt-6 flex min-h-11 items-center justify-between rounded-2xl px-4 font-display text-[15px] font-bold uppercase text-cream"
      >
        Every game
        <span aria-hidden className="text-gold">→</span>
      </Link>

      <Link
        href={withSport('/h2h', sport)}
        className="surface mt-2 flex min-h-11 items-center justify-between rounded-2xl px-4 font-display text-[15px] font-bold uppercase text-cream"
      >
        Head to head
        <span aria-hidden className="text-gold">→</span>
      </Link>
    </main>
  )
}
