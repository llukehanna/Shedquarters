import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

// Every ladder page is dynamic (it reads the sport cookie and the database),
// so there is nothing to revalidate. The few prerendered routes (the
// manifest, icons, /_not-found) are served read-only from the static assets,
// which needs no R2 or KV cache.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
})
