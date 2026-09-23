'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { claimPlayer, addAndClaimGuest } from '@/lib/actions'
import { Wordmark } from '@/components/ui/Wordmark'

export type ClaimablePlayer = {
  id: string
  displayName: string
  isHousemate: boolean
  claimed: boolean
}

/**
 * The moment a phone becomes somebody's. Claimed names stay tappable and only
 * ask for a second confirmation: a new phone, a reinstall and a borrowed phone
 * all have to be able to reclaim without anyone administering anything.
 */
export function WhoAreYou({ players }: { players: ClaimablePlayer[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<ClaimablePlayer | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const housemates = players.filter((p) => p.isHousemate)
  const guests = players.filter((p) => !p.isHousemate)

  function claim(player: ClaimablePlayer) {
    if (pending) return
    startTransition(async () => {
      await claimPlayer(player.id)
      router.replace('/')
    })
  }

  function addMe() {
    if (pending || name.trim().length === 0) return
    startTransition(async () => {
      const added = await addAndClaimGuest(name)
      if (!added) {
        setError(`"${name.trim()}" is already on the roster — tap the name above instead.`)
        return
      }
      router.replace('/')
    })
  }

  if (confirming) {
    return (
      <main className="cardinal-panel mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-md flex-col px-4 pt-10 pb-8">
        <Wordmark variant="stacked" />
        <div className="mt-auto">
          <h1 className="headline text-[44px]">
            You&rsquo;re <span className="text-gold">{confirming.displayName}</span>?
          </h1>
          {confirming.claimed && (
            <p className="mt-3 text-[14px] leading-snug text-cream/80">
              Already claimed on another phone. Confirming moves it to this one.
            </p>
          )}
          <button
            type="button"
            onClick={() => claim(confirming)}
            disabled={pending}
            className="mt-6 flex min-h-14 w-full items-center justify-center rounded-xl bg-gold font-display text-[23px] font-extrabold uppercase italic text-gold-ink disabled:opacity-40"
          >
            {pending ? 'One sec…' : `Yes, I'm ${confirming.displayName}`}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            disabled={pending}
            className="mt-2 flex min-h-11 w-full items-center justify-center font-display text-[15px] font-bold uppercase tracking-[0.12em] text-cream/70"
          >
            Not me
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="cardinal-panel mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-md flex-col px-4 pt-10 pb-8">
      <Wordmark variant="stacked" />
      <h1 className="headline mt-6 text-[44px]">
        Who <span className="text-gold">are you?</span>
      </h1>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {[...housemates, ...guests].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setConfirming(p)}
            // Claimed names stay fully tappable — reclaiming a name from a new
            // phone, a reinstall, or a borrowed phone is a feature, not an
            // error state — so this is a lighter treatment, not a disabled
            // one. text-cream/70 (not /40) keeps it above AA on the outdoor
            // screen this app runs on, and the "claimed" caption is the
            // note the grid itself has to carry (spec §2) rather than only
            // showing up after the tap, on the confirmation screen.
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 text-center font-display font-bold uppercase ${
              p.claimed ? 'border-cream/15 text-cream/70' : 'border-gold/45 text-cream'
            }`}
          >
            <span className="text-[18px]">{p.displayName}</span>
            {p.claimed && (
              // Small, normal-weight text needs more contrast than the bold
              // 18px name above to clear AA — /85 rather than the name's /70.
              <span className="font-body text-[11px] font-normal normal-case tracking-normal text-cream/85">
                claimed
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-gold/20 pt-4">
        <label htmlFor="who-name" className="eyebrow text-gold">
          Not here? Add yourself
        </label>
        <input
          id="who-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          autoComplete="off"
          placeholder="Your name"
          className="mt-2 min-h-12 w-full rounded-[10px] border border-cream/20 bg-black/25 px-3 text-[17px] text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
        />
        {error && (
          <p role="alert" className="mt-2 text-[13px] leading-snug text-gold">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={addMe}
          disabled={pending || name.trim().length === 0}
          className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border border-gold/45 font-display text-[17px] font-extrabold uppercase italic text-cream disabled:opacity-40"
        >
          Add me as a guest
        </button>
      </div>

      <button
        type="button"
        onClick={() => router.replace('/')}
        disabled={pending}
        className="mt-6 flex min-h-11 w-full items-center justify-center font-display text-[13px] font-bold uppercase tracking-[0.14em] text-cream/60"
      >
        Skip for now
      </button>
    </main>
  )
}
