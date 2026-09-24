'use client'

import { useActionState, useEffect, useState, startTransition } from 'react'
import { submitPin } from '@/app/gate/actions'
import type { GateStatus } from '@/lib/domain/gate-limit'
import { PIN_LENGTH, pressDigit, pressBackspace, isComplete } from '@/lib/ui/pin'
import { Wordmark } from '@/components/ui/Wordmark'

const MESSAGES: Record<Exclude<GateStatus, 'ok'>, { title: string; body: string }> = {
  wrong: { title: 'Wrong PIN', body: 'Try again.' },
  'locked-ip': {
    title: 'Too many tries',
    body: 'This wifi is locked out of new sign-ins for about 15 minutes. Phones already signed in still work.',
  },
  'locked-global': {
    title: 'Gate locked',
    body: 'Too many wrong tries across Shedquarters. Phones already signed in still work — ask someone who is.',
  },
  misconfigured: {
    title: 'Not set up',
    body: 'The server is missing HOUSE_PASSCODE or AUTH_SECRET.',
  },
  busy: { title: 'Busy', body: 'The gate is busy right now. Try again in a moment.' },
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

export function GateForm({ staleInvite = false }: { staleInvite?: boolean }) {
  const [status, dispatch, pending] = useActionState(submitPin, null)
  const [pin, setPin] = useState('')
  const message = status && status !== 'ok' ? MESSAGES[status] : null
  const locked = status === 'locked-ip' || status === 'locked-global'

  function press(key: string) {
    if (pending) return
    if (key === 'back') {
      setPin((p) => pressBackspace(p))
      return
    }
    const next = pressDigit(pin, key)
    if (isComplete(next)) {
      const data = new FormData()
      data.set('code', next)
      startTransition(() => dispatch(data))
      setPin('')
    } else {
      setPin(next)
    }
  }

  // Physical keyboards type the PIN too. State is only set inside the listener.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Backspace') press('back')
      else if (/^[0-9]$/.test(e.key)) press(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-md flex-col px-4 pt-10 pb-8">
      <div className="text-center">
        <Wordmark variant="inline" />
      </div>

      {staleInvite && (
        <p role="alert" className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] leading-snug text-fg">
          That invite link has been reset. Ask someone in the Shed for the new one, or use the Shed PIN.
        </p>
      )}

      <p className="eyebrow mt-12 text-center text-fg">Shed PIN</p>

      <div className="my-5 flex justify-center gap-3.5" aria-hidden>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-accent ${i < pin.length || pending ? 'bg-accent' : ''} ${pending ? 'motion-safe:animate-pulse' : ''}`}
          />
        ))}
      </div>

      <p role="status" aria-live="polite" className="min-h-[88px]">
        {message && (
          <span className="block rounded-xl border border-down/45 bg-down/15 px-3 py-2.5 text-center text-[13px] leading-snug">
            <span className="block font-display text-[21px] font-extrabold uppercase">{message.title}</span>
            {message.body}
          </span>
        )}
      </p>

      <div className={`mt-auto grid grid-cols-3 gap-2 ${locked ? 'opacity-30' : ''}`}>
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={pending}
              onClick={() => press(key)}
              aria-label={key === 'back' ? 'Delete' : key}
              className="surface flex min-h-14 items-center justify-center rounded-xl font-display text-[27px] font-bold"
            >
              {key === 'back' ? '⌫' : key}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
