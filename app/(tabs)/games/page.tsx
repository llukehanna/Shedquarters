import Link from 'next/link'
import { getGameLog, getPlayers, GAME_LOG_LIMIT, type GameLogEntry } from '@/lib/queries'
import type { Player } from '@/lib/queries'
import { groupByNight, liveGameCount } from '@/lib/domain/game-log'
import { getRatingDeltas } from '@/lib/ratings-cache'
import type { GameDelta } from '@/lib/domain/ratings'
import { TopBar } from '@/components/ui/TopBar'
import { Pill } from '@/components/ui/Pill'
import { countLabel, formatNightDate, formatDiffAverage } from '@/lib/ui/format'

export const dynamic = 'force-dynamic'

export default async function GamesPage() {
  // getRatingDeltas() shares its scan of `games` and its openskill replay
  // with the ranks/profile pages' getRatings() — both are cached behind the
  // same fingerprint in lib/ratings-cache.ts, so this page never re-fetches
  // the whole table or re-replays history on its own. Rows below just look
  // their own delta up by `ord`.
  const [{ games, truncated }, players, deltas] = await Promise.all([
    getGameLog(),
    getPlayers(),
    getRatingDeltas(),
  ])
  const nights = groupByNight(games)

  return (
    <main>
      <TopBar right={<Link href="/" className="eyebrow flex min-h-11 items-center text-cream">← Ranks</Link>} />

      <h1 className="headline mt-2 text-[46px]">
        Game <span className="text-gold">Log</span>
      </h1>
      <p className="eyebrow mt-2 mb-4">Every result · {countLabel(liveGameCount(games), 'game')}</p>

      {nights.length === 0 ? (
        <p className="surface rounded-2xl px-3 py-4 text-[13px] text-muted">
          No games logged yet.
        </p>
      ) : (
        nights.map((night) => (
          <section key={night.sessionId} className="mt-6 first:mt-0">
            <h2 className="mb-2 flex items-baseline justify-between">
              <span className="eyebrow text-gold">{formatNightDate(night.date)}</span>
              <span className="eyebrow text-faint">{countLabel(liveGameCount(night.games), 'game')}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {night.games.map((g) => (
                <GameRow key={g.ord} game={g} players={players} delta={deltas.get(g.ord)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {truncated && (
        <p className="mt-8 text-[12px] leading-relaxed text-faint">
          Showing the most recent {GAME_LOG_LIMIT} games. Older nights aren&apos;t shown here.
        </p>
      )}
    </main>
  )
}

function GameRow({
  game,
  players,
  delta,
}: {
  game: GameLogEntry
  players: Player[]
  delta?: GameDelta
}) {
  const winnerIds = game.winner === 'a' ? game.teamA : game.teamB
  const loserIds = game.winner === 'a' ? game.teamB : game.teamA
  const winnerScore = game.winner === 'a' ? game.scoreA : game.scoreB
  const loserScore = game.winner === 'a' ? game.scoreB : game.scoreA
  const { voided } = game

  return (
    <li className={`surface rounded-2xl px-3 py-2.5 ${voided ? 'opacity-55' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`flex items-baseline gap-1.5 font-display text-[15px] font-bold leading-snug uppercase text-gold ${voided ? 'line-through' : ''}`}
          >
            <span className="min-w-0">{namesOf(winnerIds, players)}</span>
            {delta && <RatingDelta value={delta.winnerDelta} />}
          </p>
          <p
            className={`mt-0.5 flex items-baseline gap-1.5 font-display text-[13px] font-semibold leading-snug uppercase text-cream/60 ${voided ? 'line-through' : ''}`}
          >
            <span className="min-w-0">{namesOf(loserIds, players)}</span>
            {delta && <RatingDelta value={delta.loserDelta} />}
          </p>
        </div>
        <p
          className={`shrink-0 whitespace-nowrap font-mono text-[16px] font-bold ${voided ? 'text-muted line-through' : ''}`}
        >
          <span className={voided ? '' : 'text-gold'}>{winnerScore}</span>
          <span className="text-muted">–</span>
          <span className={voided ? '' : 'text-cream/80'}>{loserScore}</span>
        </p>
      </div>
      {voided && (
        <p className="mt-1.5">
          <Pill tone="dim">Voided — not counted</Pill>
        </p>
      )}
    </li>
  )
}

/**
 * A team's rating movement for one game. Colored off the delta's own sign —
 * not by whether it's rendered on the winner's or loser's line — since nothing
 * guarantees the winning side's average ordinal always moves up (an uneven or
 * heavily lopsided-skill matchup could, in principle, move it either way).
 * Exactly zero gets neither color, matching the point-diff `Stat` convention
 * on the player profile page.
 *
 * The visible number is `aria-hidden`, with a separate `sr-only` sibling
 * carrying the same value in words — an `aria-label` on a plain `<span>`
 * (the "generic" ARIA role) is name-prohibited and isn't reliably exposed by
 * assistive tech, so a screen reader would otherwise still just read the
 * bare number with no meaning.
 */
function RatingDelta({ value }: { value: number }) {
  const tone = value > 0 ? 'text-up' : value < 0 ? 'text-down' : ''
  const formatted = formatDiffAverage(value)
  return (
    <span className="shrink-0 inline-flex items-baseline">
      <span aria-hidden="true" className={`font-mono text-[11px] font-semibold normal-case ${tone}`}>
        {formatted}
      </span>
      <span className="sr-only">rating change {formatted}</span>
    </span>
  )
}

/**
 * Plain text, not links: up to six names in a 3v3 row can't each be a
 * 44px tap target without wrecking the layout, and profiles are already
 * reachable from the rankings — the log is for reading results. Not
 * `truncate`, so a long name wraps onto a second line instead of being
 * silently cut off.
 */
function namesOf(ids: string[], players: Player[]): string {
  return ids.map((id) => players.find((p) => p.id === id)?.displayName ?? '?').join(' · ')
}
