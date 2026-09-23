/**
 * The whole wordmark easter egg as a state machine: how a tap advances the
 * streak, when a slow tap throws it away, when the reveal opens, and what
 * dismissing does. Clock-injected and pure, so every rule here is testable
 * without a browser or a fake timer.
 *
 * `components/ui/Wordmark.tsx` deliberately holds nothing but this state and
 * two handlers that call straight into these two functions — no branch, no
 * threshold and no timing rule lives in the component, because none of that
 * could be tested there.
 */

/** Taps on the wordmark that reveal the message. */
export const SHIELDS_TAPS = 7

/**
 * Longest gap allowed between consecutive taps. A deliberate seven-tap drum
 * roll clears this comfortably; a tap now and another one on tomorrow's visit
 * to the same screen starts over, so the egg can't hatch from a week of
 * ordinary, unrelated taps.
 */
export const SHIELDS_TAP_WINDOW_MS = 1_200

/** The message, verbatim. An inside joke is not a phrase to paraphrase. */
export const SHIELDS_MESSAGE = 'YOU SUCK SHIELDS'

export type EggState = {
  /** Taps in the current run. Always 0 while `revealed`. */
  count: number
  /** Epoch ms of the most recent counted tap; null before the first one. */
  lastTapAt: number | null
  /** Whether the reveal is up. */
  revealed: boolean
}

export const EGG_CLOSED: EggState = { count: 0, lastTapAt: null, revealed: false }

/**
 * Folds one tap on the wordmark into the state.
 *
 * A tap more than `SHIELDS_TAP_WINDOW_MS` after the previous one doesn't just
 * fail to advance the run — it starts a fresh one *at this tap*, so a slow
 * tapper who then speeds up still gets there, rather than having to lift off
 * and start again. Reaching the target opens the reveal and resets the count
 * to zero, so a reveal always costs a full `SHIELDS_TAPS`.
 *
 * While the reveal is up it covers the wordmark, so a tap cannot reach it —
 * but if one ever did, it is ignored rather than quietly re-arming a run
 * behind the panel.
 */
export function tapWordmark(state: EggState, now: number): EggState {
  if (state.revealed) return state

  const continuing = state.lastTapAt !== null && now - state.lastTapAt <= SHIELDS_TAP_WINDOW_MS
  const count = (continuing ? state.count : 0) + 1

  if (count >= SHIELDS_TAPS) {
    return { count: 0, lastTapAt: now, revealed: true }
  }
  return { count, lastTapAt: now, revealed: false }
}

/**
 * Closes the reveal. The run is already spent (reaching the target zeroed
 * it), so dismissing leaves nothing primed: earning it again costs another
 * full `SHIELDS_TAPS`.
 *
 * Dismissing something already dismissed returns the *same* object, not an
 * equal one. That matters: the panel's own backdrop closes it too, so
 * tapping the button inside sends the click on to the backdrop and closes
 * it twice. A fresh object each time is a state change as far as React is
 * concerned, and re-rendering mid-exit leaves the panel faded to nothing
 * but still mounted, over the whole screen, permanently.
 */
export function dismissReveal(state: EggState): EggState {
  return state.revealed ? { ...state, revealed: false } : state
}
