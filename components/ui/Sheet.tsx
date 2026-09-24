'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FOCUSABLE_SELECTOR } from '@/lib/ui/focus'

/** A bottom sheet over a dimmed backdrop. Tapping the backdrop or Escape closes it. */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // Keep the latest onClose in a ref, updated from its own effect (refs must
  // not be written during render), so the focus-trap effect below doesn't
  // need onClose as a dependency — an inline onClose recreated on every
  // parent render would otherwise re-run that effect and yank focus while
  // the sheet stays open.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const focusables = () =>
      sheetRef.current
        ? Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        : []

    const initial = focusables()[0]
    ;(initial ?? sheetRef.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        sheetRef.current?.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !sheetRef.current?.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !sheetRef.current?.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocusedRef.current?.focus()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-[22px] border-t border-accent/35 bg-gradient-to-b from-sheet-top to-sheet-bottom px-4 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-fg/25" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
