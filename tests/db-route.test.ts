/**
 * Which database connection a Worker request uses (lib/db.ts). Everything
 * may go through the Hyperdrive binding, except the PIN gate: its
 * transaction takes `pg_advisory_xact_lock`, and Hyperdrive lists advisory
 * locks as unsupported. If the gate ever picked the binding, sign-in could
 * fail on a game night with nothing else wrong, so the gate's whole path is
 * driven here against a fake Workers runtime and must only ever connect to
 * DATABASE_URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DIRECT = 'postgresql://direct.example/db'
const POOLED = 'postgresql://hyperdrive.local/db'

const h = vi.hoisted(() => ({
  opened: [] as string[],
  statements: [] as string[],
  env: {} as Record<string, unknown>,
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ ctx: ctxForTest, env: h.env }),
}))
const ctxForTest = {}

// A postgres.js stand-in: records which URL each client was opened with and
// the SQL it ran, and answers the gate's count query with no failures.
vi.mock('postgres', () => ({
  default: (url: string) => {
    h.opened.push(url)
    const run = (strings: TemplateStringsArray) => {
      const text = strings.join('?')
      h.statements.push(text)
      return Promise.resolve(/count\(\*\)/.test(text) ? [{ ip_failures: 0, global_failures: 0 }] : [])
    }
    const tx = Object.assign(run, { unsafe: (text: string) => (h.statements.push(text), Promise.resolve([])) })
    return Object.assign(run, { begin: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) })
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
  vi.stubEnv('DATABASE_URL', DIRECT)
  vi.stubEnv('HOUSE_PASSCODE', '1234')
  vi.stubEnv('AUTH_SECRET', 'test-secret')
  h.opened.length = 0
  h.statements.length = 0
  h.env = { HYPERDRIVE: { connectionString: POOLED } }
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('database routing on Workers', () => {
  it('sends ordinary queries through Hyperdrive when it is bound', async () => {
    const { sql } = await import('@/lib/db')
    await sql`select 1`
    expect(h.opened).toEqual([POOLED])
  })

  it('falls back to DATABASE_URL without the binding', async () => {
    h.env = {}
    const { sql } = await import('@/lib/db')
    await sql`select 1`
    expect(h.opened).toEqual([DIRECT])
  })

  it('never routes the gate through Hyperdrive', async () => {
    const { attemptGate } = await import('@/lib/gate')
    expect(await attemptGate('1234', '203.0.113.7')).toBe('ok')
    expect(h.statements.some((s) => s.includes('pg_advisory_xact_lock'))).toBe(true)
    expect(h.opened).toEqual([DIRECT])
  })

  it('connectionString keeps the direct route off the binding', async () => {
    const { connectionString } = await import('@/lib/db')
    expect(connectionString('pooled', h.env)).toBe(POOLED)
    expect(connectionString('direct', h.env)).toBe(DIRECT)
  })
})
