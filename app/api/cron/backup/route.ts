import { NextResponse } from 'next/server'
import { assembleDump } from '@/lib/backup'
import { safeEqual } from '@/lib/auth'
import { putBackup } from '@/lib/backup-store'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // A missing CRON_SECRET is a server misconfiguration, not "no auth
  // required" — fail closed (500, no DB work) rather than serving the
  // full dump to anyone on the internet. Mirrors requirePasscode()'s
  // treatment of a missing HOUSE_PASSCODE in lib/auth.ts.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  // The Worker's Cron Trigger (custom-worker.ts) sends this header on the
  // nightly run; checking it first — before any database work — is what stops anyone
  // on the internet from hammering this endpoint or forcing needless
  // queries against the database. Compared in constant time via the same
  // helper lib/auth.ts uses for the house passcode.
  const authHeader = req.headers.get('authorization') ?? ''
  if (!safeEqual(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const dump = await assembleDump()
  const stamp = new Date().toISOString().slice(0, 10)
  // One object per day; a second run the same day overwrites it.
  const key = `backups/${stamp}.json`
  await putBackup(key, JSON.stringify(dump, null, 2))

  return NextResponse.json({ ok: true, key, games: dump.games.length })
}
