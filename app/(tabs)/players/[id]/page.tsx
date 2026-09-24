import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRatings } from '@/lib/ratings-cache'
import { getPlayers, getGameLogAll } from '@/lib/queries'
import { headToHeadBoth, playerSportSummary, type WinLoss } from '@/lib/domain/player-summary'
import { TopBar } from '@/components/ui/TopBar'
import { SportCard } from '@/components/ui/SportCard'
import { SPORT_RULES, type Sport } from '@/lib/domain/sport'
import { countLabel } from '@/lib/ui/format'

export const dynamic = 'force-dynamic'

/**
 * A player's page shows both sports at once: one roster, two ladders. The
 * page itself is neutral (`data-sport="both"`) and each sport's card wears its
 * own colours, so it has no Die │ Spike pill of its own.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // getGameLogAll() rather than getGames(): same rows, plus the timestamp the
  // Ghost badge needs.
  const [players, dieRatings, dieGames, spikeRatings, spikeGames] = await Promise.all([
    getPlayers(),
    getRatings('beer_die'),
    getGameLogAll('beer_die'),
    getRatings('spikeball'),
    getGameLogAll('spikeball'),
  ])
  const me = players.find((p) => p.id === id)
  if (!me) notFound()

  const now = new Date()
  const die = playerSportSummary(dieRatings, dieGames, id, now)
  const spike = playerSportSummary(spikeRatings, spikeGames, id, now)
  const rivals = headToHeadBoth({ beer_die: dieGames, spikeball: spikeGames }, id, players)

  return (
    // Bleeds past the layout's gutter so the neutral ground reaches the edges.
    <main data-sport="both" className="-mx-4 -mt-2 min-h-dvh bg-ground px-4 pt-2 text-fg">
      <TopBar
        right={
          <Link href="/" className="eyebrow flex min-h-11 items-center text-fg">
            ← Ranks
          </Link>
        }
      />

      <h1 className="headline mt-2 text-[54px]">{me.displayName}</h1>
      {me.nicknames.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[14px] text-fg/70">
          {me.nicknames.map((n) => (
            <span key={n}>&ldquo;{n}&rdquo;</span>
          ))}
        </p>
      )}
      <p className="eyebrow mt-2">
        {me.isHousemate ? 'Housemate' : 'Guest'} · {countLabel(die.played, 'die game')} · {spike.played} spikeball
      </p>

      <SportCard sport="beer_die" summary={die} />
      <SportCard sport="spikeball" summary={spike} />

      <section className="mt-6 pb-4">
        <h2 className="mb-1 flex items-center gap-2">
          <span className="eyebrow flex-1">Head to head</span>
          <span className="eyebrow w-[54px] text-center text-[10.5px]">Die</span>
          <span className="eyebrow w-[54px] text-center text-[10.5px]">Spike</span>
        </h2>
        {rivals.length === 0 ? (
          <p className="surface rounded-2xl px-3 py-4 text-[13px] text-muted">No head-to-head games logged yet.</p>
        ) : (
          <ul>
            {rivals.map(({ player, die: d, spike: s }) => (
              <li key={player.id} className="flex min-h-12 items-center gap-2 border-b border-fg/10 last:border-b-0">
                <Link
                  href={`/players/${player.id}`}
                  className="flex min-h-11 flex-1 items-center self-stretch font-display text-[18px] font-bold uppercase"
                >
                  {player.displayName}
                </Link>
                <Chip sport="beer_die" record={d} me={id} them={player.id} />
                <Chip sport="spikeball" record={s} me={id} them={player.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

/**
 * One sport's record against one opponent, in that sport's colours. It links
 * to that sport's head-to-head page with `?sport=`, which switches this phone
 * to that sport on the way (a plain `<a>`, for the same reason as the pill).
 */
function Chip({ sport, record, me, them }: { sport: Sport; record: WinLoss | null; me: string; them: string }) {
  const name = SPORT_RULES[sport].name.toLowerCase()
  if (record === null) {
    return (
      <span
        role="img"
        aria-label={`Never played in ${name}`}
        className="flex h-8 w-[54px] items-center justify-center rounded-lg border border-dashed border-fg/20 font-mono text-[13px] text-muted"
      >
        —
      </span>
    )
  }
  return (
    <a
      data-sport={sport}
      href={`/h2h?a=${me}&b=${them}&sport=${sport}`}
      aria-label={`${record.wins}–${record.losses} in ${name}`}
      className="panel flex h-8 w-[54px] items-center justify-center rounded-lg font-mono text-[13px] font-bold"
    >
      {record.wins}–{record.losses}
    </a>
  )
}
