import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPlayers } from '@/lib/queries'
import { addPlayer } from '@/lib/actions'
import { requirePasscode, currentPlayerId } from '@/lib/auth'
import { TopBar } from '@/components/ui/TopBar'
import { RosterList } from '@/components/RosterList'
import { countLabel } from '@/lib/ui/format'

export const dynamic = 'force-dynamic'

export default async function Roster({
  searchParams,
}: {
  searchParams: Promise<{ duplicate?: string }>
}) {
  try {
    await requirePasscode()
  } catch {
    redirect('/gate')
  }
  const [players, playerId] = await Promise.all([getPlayers(), currentPlayerId()])
  const { duplicate } = await searchParams

  async function submit(formData: FormData) {
    'use server'
    const name = String(formData.get('name') ?? '')
    const added = await addPlayer(name, formData.get('housemate') === 'on')
    if (!added) redirect(`/roster?duplicate=${encodeURIComponent(name.trim())}`)
    redirect('/roster')
  }

  return (
    <main>
      <TopBar />
      <h1 className="headline mt-2 text-[46px]">
        The <span className="text-gold">Shed</span>
      </h1>
      <p className="eyebrow mt-2">Roster · {countLabel(players.length, 'player')}</p>

      {playerId === null && (
        <Link
          href="/who"
          className="surface mt-4 flex min-h-14 items-center justify-between rounded-2xl px-4 font-display text-[17px] font-extrabold uppercase italic"
        >
          Who are you? <span className="text-gold">Pick your name →</span>
        </Link>
      )}

      {duplicate && (
        <p role="alert" className="mt-4 rounded-xl border border-down/45 bg-cardinal-hi/25 px-3 py-2 text-[13px]">
          &ldquo;{duplicate}&rdquo; is already on the roster — not added again.
        </p>
      )}

      <form action={submit} className="surface mt-4 grid gap-3 rounded-2xl p-3">
        <label htmlFor="name" className="eyebrow text-gold">Add a player</label>
        <input
          id="name"
          name="name"
          required
          autoComplete="off"
          placeholder="Name"
          className="min-h-12 rounded-[10px] border border-gold/15 bg-black/30 px-3 text-[17px] text-cream placeholder:text-faint focus:border-gold focus:outline-none"
        />
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" name="housemate" defaultChecked className="h-5 w-5 accent-gold" />
          Housemate <span className="text-muted">(uncheck for a guest)</span>
        </label>
        <button
          type="submit"
          className="flex min-h-12 items-center justify-center rounded-xl bg-gold font-display text-[20px] font-extrabold italic uppercase text-gold-ink"
        >
          Add player
        </button>
      </form>

      <RosterList players={players} />
    </main>
  )
}
