/**
 * The bits of a focus trap that don't need a DOM. Shared by the score sheet
 * (`components/ui/Sheet.tsx`) and the wordmark reveal
 * (`components/ui/ShieldsReveal.tsx`) so there is one definition of "what
 * counts as focusable" and one definition of where Tab goes at the edges.
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Where Tab should move focus inside a trap, or null to let the browser
 * handle it normally.
 *
 * `current` is the index of the focused element within the trap's focusables,
 * or -1 when focus has escaped the trap entirely (which is exactly the case a
 * trap exists to catch — it must pull focus back in, not shrug). Returns the
 * index to focus, or null when the move is an ordinary step between two
 * elements that are both already inside.
 */
export function nextTrapFocus(count: number, current: number, shiftKey: boolean): number | null {
  if (count === 0) return null

  // Focus is outside the trap: pull it back to the end it is about to enter.
  if (current < 0) return shiftKey ? count - 1 : 0

  // Wrap at the edges. Anywhere else, the browser's own order is correct.
  if (shiftKey) return current === 0 ? count - 1 : null
  return current === count - 1 ? 0 : null
}
