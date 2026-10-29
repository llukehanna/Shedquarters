'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Older than this and a page shown from the phone's cache is refreshed.
 *
 * Every refresh is a whole Worker invocation, CPU-limited on the Free plan, so
 * the line is not "anything not rendered this instant": at 3 seconds nearly
 * every cached arrival refreshed. Half a minute is well under the time a game
 * takes, and the phone's own writes never wait on it: a server action's
 * revalidatePath, or the queue's router.refresh(), drops the cache at once.
 * It is also the minimum interval between refreshes of a page: a refresh
 * re-renders the page with a new `renderedAt`, which the next arrival is
 * measured against.
 */
export const STALE_AFTER_MS = 30_000

/**
 * The Table is the exception: it is the live, shared screen of a night, and
 * several phones log games on it. Shown from the cache it must catch up at
 * once, or the next game is entered against a table that has moved on.
 */
export const LIVE_STALE_AFTER_MS = 3_000

/**
 * Tabs are kept in the phone's page cache (next.config.ts staleTimes), so
 * going back to one shows it instantly, but possibly as it was a little
 * while ago. This refreshes it in the background when it is older than
 * `staleAfterMs` (STALE_AFTER_MS unless the page says otherwise).
 * `renderedAt` is stamped by the server, so a page it has only just rendered
 * (a tapped tab: links don't prefetch) is left alone rather than fetched
 * twice. The refresh swaps content in place, with no
 * loading state, and keeps any client state (a half-picked table, an open
 * sheet).
 */
export function RefreshIfStale({
  renderedAt,
  staleAfterMs = STALE_AFTER_MS,
}: {
  renderedAt: number
  staleAfterMs?: number
}) {
  const router = useRouter()
  useEffect(() => {
    if (Date.now() - renderedAt > staleAfterMs) router.refresh()
    // Once per arrival: a refresh remounts nothing, so this never loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
