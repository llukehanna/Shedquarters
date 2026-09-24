'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Wordmark } from '@/components/ui/Wordmark'

/**
 * The screen a housemate sees when anything in the app throws.
 *
 * Without it, React's own fallback surfaces — in production that is a minified
 * "error #441" with a link to react.dev, which happened to a real person
 * standing at the table. Server errors never carry their message to the
 * client (only a digest), so there is nothing useful to show: say plainly that
 * it broke, and give two ways out.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // The digest is the only thread back to the server log for this failure.
    console.error('Shedquarters error', error.digest ?? '', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-md flex-col px-4 pt-10 pb-8">
      <Wordmark variant="bar" />
      <div className="mt-auto">
        <h1 className="headline text-[44px]">
          That <span className="text-accent">broke.</span>
        </h1>
        <p className="mt-3 text-[15px] leading-snug text-muted">
          Nothing you did. Try again — and if it keeps happening, your sign-in may have expired, so
          open the invite link or enter the Shed PIN again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-xl bg-accent font-display text-[23px] font-extrabold uppercase italic text-accent-ink"
        >
          Try again
        </button>
        <Link
          href="/"
          className="mt-2 flex min-h-11 w-full items-center justify-center font-display text-[15px] font-bold uppercase tracking-[0.12em] text-fg/70"
        >
          Back to ranks
        </Link>
      </div>
    </main>
  )
}
