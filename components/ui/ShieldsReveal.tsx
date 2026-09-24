'use client'

import { useEffect, useId, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { SHIELDS_MESSAGE } from '@/lib/domain/easter-egg'
import { FOCUSABLE_SELECTOR, nextTrapFocus } from '@/lib/ui/focus'

/**
 * What seven quick taps on the wordmark get you.
 *
 * Everything here is `fixed` and lives outside the document flow, so it can
 * hang off the wordmark on any screen — the top bar, the gate, the who-are-
 * you list — without moving a single pixel of that screen's layout, whether
 * it is open or not. Nothing is written anywhere: close it and it is gone
 * until somebody earns it again.
 *
 * It claims `aria-modal`, so it has to behave like one. Taps are handled by
 * the panel covering the viewport, but keyboards go where they like, and the
 * screen underneath may well be listening: `components/GateForm.tsx` has a
 * window-level keydown handler that turns digits into PIN entry, and the PIN
 * gets five wrong tries before a fifteen-minute lockout. A joke must not be
 * able to spend those. So while this is open it takes focus, keeps focus,
 * gives it back on close, and swallows every key that isn't Escape or Tab
 * before anything behind it can hear about it.
 *
 * Exactly one element animates, deliberately. AnimatePresence keeps the
 * whole panel mounted until every animated descendant reports that it has
 * finished leaving, so each extra `motion.*` child inside here is another
 * thing that can hold a dismissed reveal on screen. An earlier draft
 * staggered the three words in on their own `motion.span`s and took
 * noticeably longer to go away for it. The panel now fades and settles as a
 * whole: less of a flourish, but a reveal that will not leave is a worse
 * joke than one that arrives plainly.
 */
export function ShieldsReveal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const headingId = useId()

  // Keep the latest onClose in a ref, updated from its own effect (refs must
  // not be written during render), so the effect below doesn't take onClose
  // as a dependency and tear the trap down mid-reveal on a parent re-render.
  // Same reasoning as components/ui/Sheet.tsx.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const focusables = () =>
      panelRef.current
        ? Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        : []

    // Move focus in, so the first Tab starts from inside rather than
    // continuing through whatever was behind the panel.
    ;(focusables()[0] ?? panelRef.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }

      if (e.key === 'Tab') {
        const items = focusables()
        if (items.length === 0) {
          e.preventDefault()
          panelRef.current?.focus()
        } else {
          const target = nextTrapFocus(
            items.length,
            items.indexOf(document.activeElement as HTMLElement),
            e.shiftKey,
          )
          if (target !== null) {
            e.preventDefault()
            items[target].focus()
          }
        }
        e.stopPropagation()
        return
      }

      // Everything else dies here. This listener is registered in the capture
      // phase on `window`, which is the very first stop on the event's path,
      // so stopping propagation means no handler anywhere below or after —
      // including another window-level listener in the bubble phase, like
      // GateForm's PIN keypad — ever sees the key.
      e.stopPropagation()
    }

    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previouslyFocusedRef.current?.focus()
    }
  }, [open])

  // One word per line: the biggest type a 390px phone can take without a
  // horizontal scroll, and it reads like a chant, which is the point.
  const words = SHIELDS_MESSAGE.split(' ')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          // Named by the headline it already shows, rather than an aria-label
          // repeating it — that would have it read out twice.
          aria-labelledby={headingId}
          tabIndex={-1}
          onClick={onClose}
          // Always die's colours: the Shields bulletin is a beer die bit, and
          // its type was checked against die's red panel, not spikeball's yellow.
          data-sport="beer_die"
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-br from-panel-glow via-panel to-panel-shade px-6 text-center"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.06 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          // One plain tween, in and out. A spring here looks a shade nicer
          // arriving but has to settle before AnimatePresence will unmount
          // the panel — measured at ~560ms of a reveal nobody can dismiss,
          // which reads as an unresponsive tap. 220ms is quick enough to
          // feel like the tap did it and slow enough to be a transition.
          // Measured on a production build at 224-247ms over six dismissals.
          transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <p aria-hidden className="headline text-[15px] tracking-[0.3em] text-accent">
            Shed bulletin
          </p>

          <p id={headingId} className="headline mt-3 text-[58px] leading-[0.82]">
            {words.map((word, i) => (
              <span
                key={word}
                // Last word in the accent, the rest in the foreground: both
                // clear 4.5:1 on every stop of die's panel gradient behind them.
                className={`block ${i === words.length - 1 ? 'text-accent' : 'text-fg'}`}
              >
                {word}
              </span>
            ))}
          </p>

          <p className="mt-5 max-w-[15rem] text-[13px] leading-snug text-fg/85">
            Somebody had to say it.
          </p>

          <button
            type="button"
            // The backdrop behind this closes on click too, so the event has
            // to stop here rather than arriving there as a second dismissal
            // of something already dismissed.
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="mt-8 flex min-h-11 items-center justify-center rounded-xl border border-fg/55 px-6 font-display text-[15px] font-bold tracking-[0.12em] text-fg uppercase"
          >
            Fine
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
