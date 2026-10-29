import { LIVE_STALE_AFTER_MS, RefreshIfStale, STALE_AFTER_MS } from './RefreshIfStale'

/** When the server rendered this page, for RefreshIfStale. */
function renderedAtMs(): number {
  return Date.now()
}

/**
 * Put on every tab page: see RefreshIfStale. Server component. `live` is for
 * the Table, which catches up with the other phones on every arrival.
 */
export function StaleCheck({ live = false }: { live?: boolean }) {
  return <RefreshIfStale renderedAt={renderedAtMs()} staleAfterMs={live ? LIVE_STALE_AFTER_MS : STALE_AFTER_MS} />
}
