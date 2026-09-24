// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Player } from '@/lib/queries'
import type { LogGameInput } from '@/lib/types'
import type { Table } from '@/lib/domain/table'

// The server boundary. Nothing here reaches a database: the actions are
// stubs, and `fetch` (the queue's drain) is stubbed per test below.
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/table',
  useSearchParams: () => new URLSearchParams(),
  unstable_rethrow: () => {},
}))
const actions = vi.hoisted(() => ({
  voidLastGame: vi.fn(async () => {}),
  endSession: vi.fn(async () => {}),
  setTeams: vi.fn(async () => {}),
}))
vi.mock('@/lib/actions', () => actions)

import { TableMode, UNDO_GRACE_MS } from '@/components/TableMode'
import { deadCount, pendingCount } from '@/lib/client/queue'

const QUEUE_KEY = 'house-ladder-queue'
const DEAD_KEY = 'house-ladder-dead'
const SESSION = 'session-1'

const players: Player[] = ['Ana', 'Ben', 'Cal', 'Dee', 'Eli', 'Fin', 'Gus', 'Hal', 'Ivy'].map((n) => ({
  id: n.toLowerCase(),
  displayName: n,
  photoUrl: null,
  isHousemate: true,
  nicknames: [],
}))

const serverTable: Table = {
  holders: ['ana', 'ben', 'cal'],
  challengers: ['dee', 'eli', 'fin'],
  runLength: 0,
  seq: 4,
}

function queued(): LogGameInput {
  return {
    clientId: 'c-1',
    sessionId: SESSION,
    winner: 'holders',
    loserScore: 12,
    nextChallengers: ['gus', 'hal', 'ivy'],
    targetScore: 21,
  }
}

function renderTable() {
  return render(
    <TableMode sessionId={SESSION} serverTable={serverTable} sport="beer_die" serverTarget={21} players={players} />,
  )
}

/** Holders win 21–12, Gus, Hal and Ivy are up next, tap "Log it". */
function logAGame() {
  fireEvent.click(screen.getByRole('button', { name: /Holding the/ }))
  fireEvent.click(screen.getByRole('button', { name: '12' }))
  for (const n of ['Gus', 'Hal', 'Ivy']) fireEvent.click(screen.getByRole('button', { name: n }))
  fireEvent.click(screen.getByRole('button', { name: /Log it/ }))
}

beforeEach(() => {
  window.localStorage.clear()
  refresh.mockClear()
  Object.values(actions).forEach((f) => f.mockClear())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TableMode: a double tap on "Log it"', () => {
  // The drain never settles, so the logged game stays in the queue — the
  // case where Undo would otherwise drop it silently, with no server round trip.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  })

  it('cannot land on Undo and drop the game it just logged', () => {
    vi.useFakeTimers()
    renderTable()
    logAGame()
    expect(pendingCount()).toBe(1)

    // The second tap of the double tap, on whatever now sits under the finger.
    const undo = screen.getByRole<HTMLButtonElement>('button', { name: /Undo last game/ })
    fireEvent.click(undo)

    expect(undo.disabled).toBe(true)
    expect(pendingCount()).toBe(1)
    expect(actions.voidLastGame).not.toHaveBeenCalled()
  })

  it('lets a deliberate Undo through once the moment has passed', () => {
    vi.useFakeTimers()
    renderTable()
    logAGame()

    act(() => {
      vi.advanceTimersByTime(UNDO_GRACE_MS)
    })
    const undo = screen.getByRole<HTMLButtonElement>('button', { name: /Undo last game/ })
    expect(undo.disabled).toBe(false)
    fireEvent.click(undo)

    expect(pendingCount()).toBe(0)
  })
})

describe('TableMode: sync status', () => {
  it('never says "all synced" after a drain dead-letters a game', async () => {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify([queued()]))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })))

    renderTable()

    await waitFor(() => expect(deadCount()).toBe(1))
    expect((await screen.findByRole('alert')).textContent).toMatch(/1 game not recorded/)
    expect(screen.queryByText('all synced')).toBeNull()
  })
})

describe('TableMode: ending the night', () => {
  it('refuses to end while a dead-lettered game is still unacknowledged', async () => {
    window.localStorage.setItem(DEAD_KEY, JSON.stringify([queued()]))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))

    renderTable()
    fireEvent.click(screen.getByRole('button', { name: 'End the night' }))
    fireEvent.click(screen.getByRole('button', { name: 'End it' }))

    await screen.findByText(/1 game never reached the server/)
    screen.getByRole('button', { name: /End anyway, discarding 1 unsent game/ })
    expect(actions.endSession).not.toHaveBeenCalled()
  })
})
