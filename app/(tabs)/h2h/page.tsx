import Link from 'next/link'
import { getPlayers, getGames } from '@/lib/queries'
import type { Player } from '@/lib/queries'
import { headToHeadSummary, headToHeadNote } from '@/lib/domain/stats'
import { buildH2hHref, firstParam, type H2hSelection } from '@/lib/ui/h2h'
import { TopBar } from '@/components/ui/TopBar'
import { currentSport } from '@/lib/sport-cookie'

export const dynamic = 'force-dynamic'

export default async function HeadToHeadPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string | string[]; b?: string | string[] }>
}) {
  const { a: aRaw, b: bRaw } = await searchParams
  const sport = await currentSport()
  const [players, games] = await Promise.all([getPlayers(), getGames(sport)])
  const aParam = firstParam(aRaw)
  const bParam = firstParam(bRaw)

  const a = players.find((p) => p.id === aParam)?.id
  const bMatch = players.find((p) => p.id === bParam)?.id
  // Comparing someone against themselves isn't a head-to-head — if the URL
  // somehow names the same player twice, just treat the second slot as empty.
  const b = bMatch && bMatch !== a ? bMatch : undefined

  const selection: H2hSelection = { a, b }
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? '?'

  // One walk over history for both the opposite-team record and the
  // same-team count, rather than headToHead() and sameTeamGames() each
  // re-filtering and re-sorting the whole games table on their own.
  const summary = a && b ? headToHeadSummary(games, a, b) : null
  const total = summary ? summary.wins + summary.losses : 0
  const note = summary ? headToHeadNote(total) : null

  return (
    <main>
      <TopBar />
      <Link href="/" className="eyebrow flex min-h-11 w-fit items-center text-fg">
        ← Ranks
      </Link>

      <h1 className="headline text-[46px]">
        Head <span className="text-accent">to Head</span>
      </h1>
      <p className="eyebrow mt-2 mb-4">Pick two names for the whole record between them</p>

      <div className="grid grid-cols-2 gap-2">
        <Slot label="Player one" name={a ? nameOf(a) : undefined} />
        <Slot label="Player two" name={b ? nameOf(b) : undefined} />
      </div>

      {summary && (
        <section className="mt-5">
          {total > 0 ? (
            <>
              <div className="panel rounded-2xl p-4 text-center">
                <p className="eyebrow text-accent">
                  {nameOf(a!)} vs {nameOf(b!)}
                </p>
                <p className="headline mt-1 text-[64px]">
                  {summary.wins}
                  <span className="text-accent">–</span>
                  {summary.losses}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat value={String(total)} label="Against each other" />
                <Stat value={String(summary.sameTeam)} label="On the same team" />
              </div>

              {note && (
                <p className="surface mt-3 rounded-2xl px-3 py-3 text-[14px] leading-relaxed text-muted">{note}</p>
              )}
            </>
          ) : (
            <div className="surface rounded-2xl px-4 py-5 text-center">
              <p className="text-[15px] leading-relaxed text-fg">{note}</p>
              <div className="mx-auto mt-4 max-w-[160px]">
                <Stat value={String(summary.sameTeam)} label="On the same team" />
              </div>
            </div>
          )}
        </section>
      )}

      {players.length === 0 ? (
        <p className="surface mt-6 rounded-2xl px-3 py-4 text-[13px] text-muted">
          No players on the roster yet.
        </p>
      ) : (
        <>
          <p className="eyebrow mt-6 mb-2">Player one</p>
          <PlayerPicks players={players.filter((p) => p.id !== b)} selectedId={a} slotKey="a" selection={selection} />

          <p className="eyebrow mt-5 mb-2">Player two</p>
          <PlayerPicks players={players.filter((p) => p.id !== a)} selectedId={b} slotKey="b" selection={selection} />
        </>
      )}
    </main>
  )
}

function Slot({ label, name }: { label: string; name?: string }) {
  return (
    <div>
      <p className="eyebrow mb-1.5 text-[10.5px]">{label}</p>
      <div
        className={`flex min-h-11 items-center rounded-[9px] border-[1.5px] px-3 font-display text-[16px] font-bold uppercase ${name ? 'border-accent/45 bg-accent/6 text-fg' : 'border-dashed border-accent/30 text-faint'}`}
      >
        <span className="min-w-0 truncate">{name ?? 'Tap a name'}</span>
      </div>
    </div>
  )
}

function PlayerPicks({
  players,
  selectedId,
  slotKey,
  selection,
}: {
  players: Player[]
  selectedId?: string
  slotKey: 'a' | 'b'
  selection: H2hSelection
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {players.map((p) => {
        const on = p.id === selectedId
        return (
          <li key={p.id}>
            <Link
              href={buildH2hHref(selection, slotKey, p.id)}
              aria-current={on ? 'true' : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 font-display text-[17px] font-bold uppercase ${on ? 'border-accent bg-accent text-accent-ink' : 'surface'}`}
            >
              {p.displayName}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="surface rounded-[10px] px-2.5 py-2 text-center">
      <p className="font-mono text-[23px] leading-none font-extrabold">{value}</p>
      <p className="eyebrow mt-1 text-[10px]">{label}</p>
    </div>
  )
}
