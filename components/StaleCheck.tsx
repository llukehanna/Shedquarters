import { RefreshIfStale } from './RefreshIfStale'

/** When the server rendered this page, for RefreshIfStale. */
function renderedAtMs(): number {
  return Date.now()
}

/** Put on every tab page: see RefreshIfStale. Server component. */
export function StaleCheck() {
  return <RefreshIfStale renderedAt={renderedAtMs()} />
}
