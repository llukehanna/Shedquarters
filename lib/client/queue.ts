'use client'

import type { LogGameInput } from '@/lib/types'

const KEY = 'house-ladder-queue'
const DEAD_KEY = 'house-ladder-dead'

function readFrom(key: string): LogGameInput[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? (parsed as LogGameInput[]) : []
  } catch {
    return []
  }
}

function writeTo(key: string, items: LogGameInput[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(items))
}

function read(): LogGameInput[] {
  return readFrom(KEY)
}

function write(items: LogGameInput[]): void {
  writeTo(KEY, items)
}

export function pending(): LogGameInput[] {
  return read()
}

export function pendingCount(): number {
  return read().length
}

export function enqueue(item: LogGameInput): void {
  write([...read(), item])
}

/** Removes the newest not-yet-sent item. Returns it, or null if nothing is queued. */
export function dropLast(): LogGameInput | null {
  const items = read()
  const last = items.pop() ?? null
  if (last) write(items)
  return last
}

/**
 * Games the server rejected permanently (see `isTerminal`). They are moved
 * off the head so they cannot wedge the queue, but are kept rather than
 * dropped: they are the only remaining record of a game that was logged at
 * the table and never accepted, and the UI surfaces the count so somebody
 * notices at the time rather than a week later.
 */
export function deadLettered(): LogGameInput[] {
  return readFrom(DEAD_KEY)
}

export function deadCount(): number {
  return readFrom(DEAD_KEY).length
}

/** Manual acknowledgement, so the banner can be dismissed without clearing localStorage by hand. */
export function clearDeadLettered(): void {
  writeTo(DEAD_KEY, [])
}

/**
 * A 4xx that is not 401 will never succeed on retry — a malformed payload, a
 * session that has ended, a roster the server refuses. Retrying it forever
 * blocks every game queued behind it, which on a party iPad is unrecoverable
 * without clearing localStorage by hand. 401 is excluded because the passcode
 * cookie can be re-established (and the game then goes through), and 5xx and
 * network failures are transient by definition.
 */
function isTerminal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401
}

/**
 * Drains FIFO, stopping at the first *transient* failure so ordering is
 * preserved: `seq` is assigned server-side from max(seq)+1, so an out-of-order
 * flush would mis-order the session. Re-reads before each removal so items
 * enqueued mid-flush are not dropped. A permanently-rejected head is moved to
 * the dead-letter list and the drain continues past it.
 */
async function drainQueue(): Promise<{ sent: number; failed: boolean }> {
  let sent = 0
  for (;;) {
    const items = read()
    if (items.length === 0) return { sent, failed: false }
    const head = items[0]
    let res: Response
    try {
      res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(head),
      })
    } catch {
      return { sent, failed: true }
    }
    if (!res.ok) {
      if (!isTerminal(res.status)) return { sent, failed: true }
      writeTo(DEAD_KEY, [...readFrom(DEAD_KEY), head])
      write(read().slice(1))
      continue
    }
    write(read().slice(1))
    sent++
  }
}

/**
 * The single in-flight drain. TableMode fires a drain from four independent
 * triggers (load, `online`, a 15s interval, and every logged game), so two
 * drains overlapping is routine, not exotic — and two parallel drains each
 * POST the same head item and then each remove *one* item, evicting an item
 * that was never sent. Serializing here means a second caller joins the drain
 * already running instead of starting a parallel one; nothing is ever removed
 * from the queue by a flush that did not send it.
 */
let inFlight: Promise<{ sent: number; failed: boolean }> | null = null

export function flush(): Promise<{ sent: number; failed: boolean }> {
  if (inFlight) return inFlight
  const run = drainQueue().finally(() => {
    inFlight = null
  })
  inFlight = run
  return run
}
