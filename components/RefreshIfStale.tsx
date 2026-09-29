'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Older than this and a page is treated as served from the phone's cache. */
export const STALE_AFTER_MS = 3_000

/**
 * Tabs are prefetched and kept in the phone's page cache (next.config.ts), so
 * switching to one shows it instantly, but possibly as it was up to a few
 * minutes ago. This refreshes it in the background when that is the case:
 * `renderedAt` is stamped by the server, so a page it has only just rendered
 * is left alone rather than fetched twice. The refresh swaps content in
 * place, with no loading state, and keeps any client state (a half-picked
 * table, an open sheet).
 */
export function RefreshIfStale({ renderedAt }: { renderedAt: number }) {
  const router = useRouter()
  useEffect(() => {
    if (Date.now() - renderedAt > STALE_AFTER_MS) router.refresh()
    // Once per arrival: a refresh remounts nothing, so this never loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
