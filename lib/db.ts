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
const perRequest = new WeakMap<object, Partial<Record<'pooled' | 'direct', Sql>>>()

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}

type Route = 'pooled' | 'direct'

function client(route: Route): Sql {
  if (!onWorkers) return (shared ??= postgres(databaseUrl()))

  const { ctx, env } = getCloudflareContext()
  const clients = perRequest.get(ctx) ?? {}
  perRequest.set(ctx, clients)
  let sql = clients[route]
  if (!sql) {
    // `pooled` goes through Hyperdrive when the binding is there
    // (wrangler.jsonc). Opened directly, every request pays a TLS handshake
    // and a SCRAM password exchange with Neon inside the Worker, CPU against
    // the Free plan's 10 ms, plus several round trips across the country
    // before the first query. Hyperdrive keeps warm, authenticated
    // connections to Neon and hands the Worker a local one, so both costs
    // leave the request. Without the binding (before it is created, or in a
    // preview) it is DATABASE_URL, exactly as before.
    //
    // `direct` is always DATABASE_URL: see `directSql`.
    //
    // fetch_types stays on (the default): postgres.js needs the array type
    // catalogue to parse uuid[] columns (holders, team_a, ...) into arrays and
    // to send JS arrays as Postgres arrays. Without it they arrive as '{...}'
    // strings.
    sql = postgres(connectionString(route, env), { max: 1 })
    clients[route] = sql
  }
  return sql
}

/** Which connection string a Worker request uses for `route`. Exported for tests. */
export function connectionString(route: Route, env: unknown): string {
  const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } } | undefined)?.HYPERDRIVE
  if (route === 'pooled' && hyperdrive) return hyperdrive.connectionString
  return databaseUrl()
}

function lazy(route: Route): Sql {
  return new Proxy(function () {} as unknown as Sql, {
    apply: (_target, _this, args) => (client(route) as unknown as (...a: unknown[]) => unknown)(...args),
    get: (_target, prop) => {
      const c = client(route)
      const value = Reflect.get(c, prop, c)
      return typeof value === 'function' ? value.bind(c) : value
    },
  })
}

/** Every query's client: through Hyperdrive on Workers when it is bound. */
export const sql: Sql = lazy('pooled')

/**
 * Always a direct connection to DATABASE_URL, never Hyperdrive. For the
 * statements Hyperdrive lists as unsupported: advisory locks
 * (`pg_advisory_xact_lock` in lib/gate.ts). Anything that takes an advisory
 * lock must use this, and it costs a full TLS + auth connection, so nothing
 * else should. Under Node it is the same shared client as `sql`.
 */
export const directSql: Sql = lazy('direct')
