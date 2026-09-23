/**
 * Post-deploy smoke check against a live Shedquarters.
 *
 * Run it after every production deploy:
 *   npx tsx scripts/smoke-prod.ts
 *   npx tsx scripts/smoke-prod.ts https://some-preview.vercel.app
 *
 * With an invite link in INVITE_LINK it also proves the door actually opens —
 * the one check that covers the whole chain of token, cookie and gate:
 *   INVITE_LINK="https://…/join/…" npx tsx scripts/smoke-prod.ts
 *
 * It reads nothing secret, writes nothing, and exits non-zero on the first
 * failed expectation so it can gate a deploy in CI later.
 */

const BASE = (process.argv[2] ?? 'https://house-ladder.vercel.app').replace(/\/$/, '')
const INVITE_LINK = process.env.INVITE_LINK

type Check = { name: string; ok: boolean; detail: string }
const checks: Check[] = []

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name} — ${detail}`)
}

/** Never follow redirects: where a route sends an unauthenticated phone IS the check. */
async function head(path: string): Promise<{ status: number; location: string | null }> {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { 'user-agent': 'shedquarters-smoke' } })
  return { status: res.status, location: res.headers.get('location') }
}

async function expectStatus(name: string, path: string, want: number) {
  try {
    const { status } = await head(path)
    record(name, status === want, `${path} → ${status} (want ${want})`)
  } catch (e) {
    record(name, false, `${path} → request failed: ${e instanceof Error ? e.message : e}`)
  }
}

async function expectRedirect(name: string, path: string, wantPath: string) {
  try {
    const { status, location } = await head(path)
    const target = location ? new URL(location, BASE).pathname + new URL(location, BASE).search : null
    record(name, status === 307 && target === wantPath, `${path} → ${status} ${target ?? '(no location)'} (want 307 ${wantPath})`)
  } catch (e) {
    record(name, false, `${path} → request failed: ${e instanceof Error ? e.message : e}`)
  }
}

async function main() {
  console.log(`smoke: ${BASE}\n`)

  // The rankings are the one page a signed-out visitor is meant to see.
  await expectStatus('rankings load', '/', 200)
  await expectStatus('gate loads', '/gate', 200)

  // Everything behind the house door bounces a signed-out phone to the gate.
  await expectRedirect('table is gated', '/table', '/gate')
  await expectRedirect('roster is gated', '/roster', '/gate')
  await expectRedirect('who is gated', '/who', '/gate')

  // A dead or forged link explains itself instead of erroring.
  await expectRedirect(
    'stale invite explains itself',
    '/join/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '/gate?invite=stale',
  )

  // The two read-only pages added after the first pilot. `/` and `/games`
  // both read the ratings cache, so a 200 here is also proof the cache's
  // `deltas` column survived the last migration.
  await expectStatus('game log loads', '/games', 200)
  await expectStatus('head-to-head loads', '/h2h', 200)

  // A missing player is a real 404, not a 200 with empty content.
  await expectStatus('unknown player 404s', '/players/00000000-0000-0000-0000-000000000000', 404)

  // The home-screen app's files.
  await expectStatus('manifest served', '/manifest.webmanifest', 200)
  await expectStatus('offline screen served', '/offline.html', 200)
  await expectStatus('service worker served', '/sw.js', 200)

  // The whole door, end to end: the link signs a phone in and lands on "who are you".
  if (INVITE_LINK) {
    try {
      const res = await fetch(INVITE_LINK, { redirect: 'manual', headers: { 'user-agent': 'shedquarters-smoke' } })
      const location = res.headers.get('location')
      const target = location ? new URL(location, BASE).pathname : null
      const cookie = res.headers.get('set-cookie')
      record(
        'invite link opens the door',
        res.status === 307 && target === '/who' && !!cookie,
        `→ ${res.status} ${target ?? '(no location)'}${cookie ? ' +cookie' : ' (no cookie)'}`,
      )

      if (cookie) {
        const jar = cookie.split(';')[0]
        const who = await fetch(`${BASE}/who`, { redirect: 'manual', headers: { cookie: jar } })
        record('signed-in phone reaches who are you', who.status === 200, `/who → ${who.status} (want 200)`)
        const table = await fetch(`${BASE}/table`, { redirect: 'manual', headers: { cookie: jar } })
        record('signed-in phone reaches the table', table.status === 200, `/table → ${table.status} (want 200)`)
      }
    } catch (e) {
      record('invite link opens the door', false, `request failed: ${e instanceof Error ? e.message : e}`)
    }
  } else {
    console.log('skip  invite link check — set INVITE_LINK to include it')
  }

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  if (failed.length > 0) {
    console.error(`\nFAILED: ${failed.map((c) => c.name).join(', ')}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error('smoke run failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
