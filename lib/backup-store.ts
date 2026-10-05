import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Where the nightly dump goes: the private `shedquarters-backups` KV
 * namespace, reached through the Worker's BACKUPS binding (wrangler.jsonc).
 * Nothing is public. List and read backups with
 *   npx wrangler kv key list --binding BACKUPS --remote
 *   npx wrangler kv key get --binding BACKUPS --remote backups/YYYY-MM-DD.json > out.json
 *
 * Under `next dev`, the async context comes from wrangler's local
 * simulation, so a local run writes to `.wrangler/state`, never production.
 */
export async function putBackup(key: string, body: string): Promise<void> {
  const { env } = await getCloudflareContext({ async: true })
  if (!env.BACKUPS) throw new Error('The BACKUPS KV binding is missing (see wrangler.jsonc)')
  await env.BACKUPS.put(key, body, { metadata: { contentType: 'application/json', bytes: body.length } })
}
