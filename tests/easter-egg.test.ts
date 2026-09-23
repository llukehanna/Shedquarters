import { describe, it, expect } from 'vitest'
import {
  tapWordmark,
  dismissReveal,
  EGG_CLOSED,
  SHIELDS_TAPS,
  SHIELDS_TAP_WINDOW_MS,
  SHIELDS_MESSAGE,
  type EggState,
} from '@/lib/domain/easter-egg'

/** Taps `n` times, `gap` ms apart, from a given state. Returns every state. */
function tapSeries(n: number, gap: number, from: EggState = EGG_CLOSED) {
  let state = from
  let now = from.lastTapAt ?? 10_000
  const states: EggState[] = []
  for (let i = 0; i < n; i++) {
    now += gap
    state = tapWordmark(state, now)
    states.push(state)
  }
  return { state, states, now }
}

const revealedAt = (states: EggState[]) => states.findIndex((s) => s.revealed)

describe('tapWordmark', () => {
  it('does not reveal on the first tap', () => {
    expect(tapWordmark(EGG_CLOSED, 1_000).revealed).toBe(false)
  })

  it('reveals on exactly the seventh quick tap, and not before', () => {
    const { states } = tapSeries(SHIELDS_TAPS, 50)
    expect(revealedAt(states)).toBe(SHIELDS_TAPS - 1)
  })

  it('does not reveal one tap short', () => {
    expect(tapSeries(SHIELDS_TAPS - 1, 50).states.some((s) => s.revealed)).toBe(false)
  })

  it('never reveals when every tap is slower than the window', () => {
    const { states } = tapSeries(SHIELDS_TAPS * 3, SHIELDS_TAP_WINDOW_MS + 1)
    expect(states.some((s) => s.revealed)).toBe(false)
  })

  it('still counts a tap at exactly the window edge as part of the run', () => {
    const { states } = tapSeries(SHIELDS_TAPS, SHIELDS_TAP_WINDOW_MS)
    expect(revealedAt(states)).toBe(SHIELDS_TAPS - 1)
  })

  it('drops the run when one gap is too long, and starts a fresh one at that tap', () => {
    // Six quick taps — one away — then a long pause. If the pause did not
    // reset, the very next tap would be the seventh and would fire.
    const primed = tapSeries(SHIELDS_TAPS - 1, 50)
    expect(primed.state.count).toBe(SHIELDS_TAPS - 1)

    const afterPause = tapWordmark(primed.state, primed.now + SHIELDS_TAP_WINDOW_MS + 500)
    expect(afterPause.revealed).toBe(false)
    expect(afterPause.count).toBe(1)
  })

  it('lets a slow starter who speeds up still get there, counting the slow tap as tap one', () => {
    const first = tapWordmark(EGG_CLOSED, 0)
    const slow = tapWordmark(first, SHIELDS_TAP_WINDOW_MS * 5) // restarts the run here
    expect(slow.count).toBe(1)

    const { states } = tapSeries(SHIELDS_TAPS - 1, 40, slow)
    expect(revealedAt(states)).toBe(SHIELDS_TAPS - 2)
  })

  it('zeroes the run on reveal, so it is not left primed', () => {
    const { state } = tapSeries(SHIELDS_TAPS, 50)
    expect(state).toMatchObject({ count: 0, revealed: true })
  })

  it('ignores a tap that somehow lands while the reveal is up', () => {
    const { state } = tapSeries(SHIELDS_TAPS, 50)
    expect(tapWordmark(state, state.lastTapAt! + 50)).toBe(state)
  })

  it('costs a full run again after dismissing, rather than staying primed', () => {
    const revealed = tapSeries(SHIELDS_TAPS, 50).state
    const closed = dismissReveal(revealed)

    const short = tapSeries(SHIELDS_TAPS - 1, 50, closed)
    expect(short.states.some((s) => s.revealed)).toBe(false)
    expect(tapWordmark(short.state, short.now + 50).revealed).toBe(true)
  })

  it('does not mutate the state it was handed', () => {
    const before: EggState = { count: 3, lastTapAt: 500, revealed: false }
    tapWordmark(before, 520)
    expect(before).toEqual({ count: 3, lastTapAt: 500, revealed: false })
  })

  it('records the time of every counted tap, so the next gap is measured from it', () => {
    expect(tapWordmark(EGG_CLOSED, 7_777).lastTapAt).toBe(7_777)
    expect(tapWordmark({ count: 2, lastTapAt: 0, revealed: false }, 9_999).lastTapAt).toBe(9_999)
  })

  it('starts closed', () => {
    expect(EGG_CLOSED.revealed).toBe(false)
    expect(EGG_CLOSED.count).toBe(0)
  })
})

describe('dismissReveal', () => {
  it('closes an open reveal', () => {
    const revealed = tapSeries(SHIELDS_TAPS, 50).state
    expect(revealed.revealed).toBe(true)
    expect(dismissReveal(revealed).revealed).toBe(false)
  })

  it('hands back the very same state when there was nothing to dismiss', () => {
    // Identity, not just equality. The panel's backdrop closes it as well as
    // the button inside it, so a tap on the button dismisses twice; if the
    // second one produced a new object React would treat it as a state
    // change and re-render mid-exit, which strands the panel on screen.
    const midRun = tapSeries(3, 50).state
    expect(dismissReveal(midRun)).toBe(midRun)

    const closedAgain = dismissReveal(tapSeries(SHIELDS_TAPS, 50).state)
    expect(dismissReveal(closedAgain)).toBe(closedAgain)
  })

  it('does not mutate the state it was handed', () => {
    const before: EggState = { count: 0, lastTapAt: 500, revealed: true }
    dismissReveal(before)
    expect(before.revealed).toBe(true)
  })
})

describe('constants', () => {
  it('takes seven taps', () => {
    expect(SHIELDS_TAPS).toBe(7)
  })

  it('is the exact message, verbatim', () => {
    expect(SHIELDS_MESSAGE).toBe('YOU SUCK SHIELDS')
  })

  it('splits into three lines for the panel, longest word still short', () => {
    const words = SHIELDS_MESSAGE.split(' ')
    expect(words).toHaveLength(3)
    expect(Math.max(...words.map((w) => w.length))).toBeLessThanOrEqual(8)
  })

  it('allows a comfortable but not indefinite gap between taps', () => {
    expect(SHIELDS_TAP_WINDOW_MS).toBeGreaterThanOrEqual(500)
    expect(SHIELDS_TAP_WINDOW_MS).toBeLessThanOrEqual(2_000)
  })
})
