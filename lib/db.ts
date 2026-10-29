import postgres from 'postgres'
import { getCloudflareContext } from '@opennextjs/cloudflare'

type Sql = postgres.Sql

/**
 * The database client every query goes through: `sql\`...\``, `sql.begin`,
 * `sql.unsafe` and the rest, exactly as postgres.js exposes them.
 *
 * Under Node (`next dev`, the tests, the scripts) it is one shared client, as
 * it always was. On Cloudflare Workers it is one client per request: a
 * Worker may not use a socket opened by a different request, so a pooled
 * client kept across requests fails on the second one. Each request gets its
 * own, keyed on the request's ExecutionContext, and its connection closes
 * with the request.
 */
const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

let shared: Sql | undefined
const perRequest = new WeakMap<object, Sql>()

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}

function client(): Sql {
  if (!onWorkers) return (shared ??= postgres(databaseUrl()))

  const { ctx, env } = getCloudflareContext()
  let sql = perRequest.get(ctx)
  if (!sql) {
    // Through Hyperdrive when the binding is there (wrangler.jsonc). Opened
    // directly, every request pays a TLS handshake and a SCRAM password
    // exchange with Neon inside the Worker, CPU against the Free plan's 10 ms,
    // plus several round trips across the country before the first query.
    // Hyperdrive keeps warm, authenticated connections to Neon and hands the
    // Worker a local, unencrypted one, so both costs leave the request.
    // Without the binding (before it is created, or in a preview) it is
    // DATABASE_URL, exactly as before.
    //
    // fetch_types stays on (the default): postgres.js needs the array type
    // catalogue to parse uuid[] columns (holders, team_a, ...) into arrays and
    // to send JS arrays as Postgres arrays. Without it they arrive as '{...}'
    // strings.
    const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE
    // One connection per request: a request's queries are few, and
    // postgres.js queues the rest.
    sql = postgres(hyperdrive?.connectionString ?? databaseUrl(), { max: 1 })
    perRequest.set(ctx, sql)
  }
  return sql
}

export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply: (_target, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_target, prop) => {
    const c = client()
    const value = Reflect.get(c, prop, c)
    return typeof value === 'function' ? value.bind(c) : value
  },
})
