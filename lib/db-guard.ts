/**
 * Guard for anything that hard-deletes rows.
 *
 * `games` is append-only apart from the `voided` flag — ratings are a pure
 * replay of non-voided history, and the ratings cache self-heals only because
 * no row ever disappears. The test suite and the smoke script both delete
 * sessions, which cascades to games (lib/schema.sql), and both read
 * DATABASE_URL from .env.local. Pointed at production, `npm test` would
 * silently destroy real game rows.
 *
 * Nothing destructive may run unless DATABASE_URL is a local database. This is
 * the one place that decision lives; callers just call it first.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

export function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'Refusing to run destructive database work: DATABASE_URL is not set. ' +
        'Point it at the local Postgres container (see README).',
    )
  }

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    throw new Error(
      'Refusing to run destructive database work: DATABASE_URL is not a parseable URL.',
    )
  }

  // URL.hostname wraps IPv6 literals in brackets.
  const host = hostname.replace(/^\[|\]$/g, '')
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run destructive database work against a non-local database (host: ${host}). ` +
        'This deletes sessions, which cascades to games. Point DATABASE_URL at the local ' +
        'Postgres container (see README) before running tests or scripts/smoke-session.ts.',
    )
  }
}
