import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDeadLettered,
  deadCount,
  deadLettered,
  dropLast,
  enqueue,
  flush,
  pending,
  pendingCount,
} from '@/lib/client/queue'
import type { LogGameInput } from '@/lib/types'

const KEY = 'house-ladder-queue'

function makeItem(id: string): LogGameInput {
  return {
    clientId: id,
    sessionId: 's1',
    winner: 'holders',
    loserScore: 10,
    nextChallengers: ['x1', 'x2', 'x3'],
  }
}

/** Minimal in-memory Storage stub — no jsdom needed. */
function makeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

/** A promise whose resolution the test controls, to hold a fetch mid-flight. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function bodyOf(call: unknown[]): LogGameInput {
  const init = call[1] as RequestInit
  return JSON.parse(init.body as string) as LogGameInput
}

beforeEach(() => {
  globalThis.window = { localStorage: makeLocalStorage() } as unknown as Window & typeof globalThis
  globalThis.fetch = vi.fn() as unknown as typeof fetch
})

describe('enqueue / pending / pendingCount', () => {
  it('appends items and reflects them in pending() and pendingCount()', () => {
    expect(pending()).toEqual([])
    expect(pendingCount()).toBe(0)

    enqueue(makeItem('a'))
    expect(pending()).toEqual([makeItem('a')])
    expect(pendingCount()).toBe(1)

    enqueue(makeItem('b'))
    expect(pending()).toEqual([makeItem('a'), makeItem('b')])
    expect(pendingCount()).toBe(2)
  })
})

describe('flush', () => {
  it('sends items oldest first (FIFO order) — catches a FIFO→LIFO regression', async () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))
    enqueue(makeItem('c'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({ ok: true })

    const result = await flush()

    expect(result).toEqual({ sent: 3, failed: false })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const sentIds = fetchMock.mock.calls.map((call) => bodyOf(call).clientId)
    expect(sentIds).toEqual(['a', 'b', 'c'])
    expect(pending()).toEqual([])
  })

  it('stops at the first failure, leaving the remaining items in original order', async () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))
    enqueue(makeItem('c'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })

    const result = await flush()

    expect(result).toEqual({ sent: 1, failed: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(pending()).toEqual([makeItem('b'), makeItem('c')])
  })

  it('re-reads before removing so an item enqueued mid-flush is not dropped', async () => {
    enqueue(makeItem('a'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    let calls = 0
    fetchMock.mockImplementation(async () => {
      calls++
      if (calls === 1) {
        // Simulate another enqueue() happening while the first fetch is in flight.
        enqueue(makeItem('b'))
      }
      return { ok: true }
    })

    const result = await flush()

    expect(result).toEqual({ sent: 2, failed: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const sentIds = fetchMock.mock.calls.map((call) => bodyOf(call).clientId)
    expect(sentIds).toEqual(['a', 'b'])
    expect(pending()).toEqual([])
  })

  it('leaves the queue untouched and reports failed:true when fetch throws', async () => {
    enqueue(makeItem('a'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockRejectedValue(new Error('network down'))

    const result = await flush()

    expect(result).toEqual({ sent: 0, failed: true })
    expect(pending()).toEqual([makeItem('a')])
  })

  it('returns immediately with an empty queue', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    const result = await flush()
    expect(result).toEqual({ sent: 0, failed: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('concurrent flush', () => {
  // TableMode fires drain() from four independent triggers (load, `online`, a
  // 15s interval, and every logged game), so overlapping flushes are routine.
  // Two parallel drains each POST the same head item and then each remove one
  // item, so an item is evicted from the queue *without ever having been
  // sent* — and the surviving flush still reports failed:false, so the UI says
  // "all synced" and the game is gone with no error anywhere.
  it('sends each queued item exactly once across overlapping flushes', async () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))

    const accepted: string[] = []
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation(async (_url: unknown, init: RequestInit) => {
      // Yield, so any parallel drain gets a turn between POST and removal.
      await new Promise((resolve) => setTimeout(resolve, 0))
      accepted.push((JSON.parse(init.body as string) as LogGameInput).clientId)
      return { ok: true, status: 200 }
    })

    await Promise.all([flush(), flush(), flush()])

    // Every item reached the server, exactly once, and none was dropped.
    expect([...accepted].sort()).toEqual(['a', 'b'])
    expect(pending()).toEqual([])
    expect(deadLettered()).toEqual([])
  })

  it('a second caller joins the running drain instead of starting a parallel one', async () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))

    const gate = deferred()
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    let calls = 0
    fetchMock.mockImplementation(async () => {
      calls++
      if (calls === 1) await gate.promise
      return { ok: true, status: 200 }
    })

    const first = flush()
    const second = flush()
    gate.resolve()
    const [a, b] = await Promise.all([first, second])

    expect(a).toEqual({ sent: 2, failed: false })
    expect(b).toEqual(a)
    expect(calls).toBe(2)
    expect(pending()).toEqual([])
  })

  it('loses nothing when the POST fails while a second flush overlaps', async () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))

    const gate = deferred()
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    let calls = 0
    fetchMock.mockImplementation(async () => {
      calls++
      if (calls === 1) {
        await gate.promise
        return { ok: false, status: 503 }
      }
      return { ok: true, status: 200 }
    })

    const first = flush()
    const second = flush()
    gate.resolve()
    const [a, b] = await Promise.all([first, second])

    // One drain, one attempt, one honest answer for both callers — no second
    // drain quietly reporting success over the top of the failure.
    expect(calls).toBe(1)
    expect(a).toEqual({ sent: 0, failed: true })
    expect(b).toEqual(a)
    expect(pending()).toEqual([makeItem('a'), makeItem('b')])
    expect(deadLettered()).toEqual([])
  })

  it('starts a fresh drain once the previous one has settled', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    enqueue(makeItem('a'))
    expect(await flush()).toEqual({ sent: 1, failed: false })

    enqueue(makeItem('b'))
    expect(await flush()).toEqual({ sent: 1, failed: false })

    const sentIds = fetchMock.mock.calls.map((call) => bodyOf(call).clientId)
    expect(sentIds).toEqual(['a', 'b'])
    expect(pending()).toEqual([])
  })
})

describe('dead-lettering a permanently-rejected item', () => {
  // A 400 is not a network blip: retrying it forever wedges the queue and
  // blocks every game behind it, recoverable only by clearing localStorage by
  // hand on an iPad at a party.
  it('moves a 400 off the head and keeps draining the rest', async () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValue({ ok: true, status: 200 })

    const result = await flush()

    expect(result).toEqual({ sent: 1, failed: false })
    expect(pending()).toEqual([])
    // Kept, not dropped: it is the only remaining record of that game.
    expect(deadLettered()).toEqual([makeItem('a')])
    expect(deadCount()).toBe(1)
  })

  it('does not dead-letter a 401 — the passcode cookie can be re-established', async () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    const result = await flush()

    expect(result).toEqual({ sent: 0, failed: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pending()).toEqual([makeItem('a'), makeItem('b')])
    expect(deadLettered()).toEqual([])
  })

  it('does not dead-letter a 5xx — the server may recover', async () => {
    enqueue(makeItem('a'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    expect(await flush()).toEqual({ sent: 0, failed: true })
    expect(pending()).toEqual([makeItem('a')])
    expect(deadLettered()).toEqual([])
  })

  it('does not wedge: a rejected item is gone from the queue after one flush', async () => {
    enqueue(makeItem('a'))

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({ ok: false, status: 400 })

    await flush()
    await flush()

    // One POST attempt total: the second flush found an empty queue.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pending()).toEqual([])
    expect(deadCount()).toBe(1)
  })

  it('clearDeadLettered() acknowledges them', async () => {
    enqueue(makeItem('a'))
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({ ok: false, status: 400 })
    await flush()

    expect(deadCount()).toBe(1)
    clearDeadLettered()
    expect(deadCount()).toBe(0)
    expect(deadLettered()).toEqual([])
  })
})

describe('dropLast', () => {
  it('removes and returns the newest item', () => {
    enqueue(makeItem('a'))
    enqueue(makeItem('b'))

    const dropped = dropLast()

    expect(dropped).toEqual(makeItem('b'))
    expect(pending()).toEqual([makeItem('a')])
  })

  it('returns null on an empty queue', () => {
    expect(dropLast()).toBeNull()
    expect(pending()).toEqual([])
  })
})

describe('corrupt storage recovery', () => {
  it('recovers to [] for a non-JSON string', () => {
    window.localStorage.setItem(KEY, 'not-json{{{')
    expect(pending()).toEqual([])
    expect(pendingCount()).toBe(0)
  })

  it('recovers to [] for syntactically valid JSON of the wrong shape (object)', () => {
    window.localStorage.setItem(KEY, '{}')
    expect(pending()).toEqual([])
  })

  it('recovers to [] for syntactically valid JSON of the wrong shape (null)', () => {
    window.localStorage.setItem(KEY, 'null')
    expect(pending()).toEqual([])
  })

  it('recovers to [] for syntactically valid JSON of the wrong shape (number)', () => {
    window.localStorage.setItem(KEY, '42')
    expect(pending()).toEqual([])
  })
})

describe('no-window (server) context', () => {
  it('enqueue does not throw and leaves nothing to read back', () => {
    Reflect.deleteProperty(globalThis, 'window')

    expect(() => enqueue(makeItem('a'))).not.toThrow()
    expect(pending()).toEqual([])
    expect(pendingCount()).toBe(0)
  })
})
