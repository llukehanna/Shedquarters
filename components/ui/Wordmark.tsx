'use client'

import { useCallback, useState } from 'react'
import { EGG_CLOSED, dismissReveal, tapWordmark, type EggState } from '@/lib/domain/easter-egg'
import { ShieldsReveal } from './ShieldsReveal'

/**
 * The three Shedquarters lockups. "SHED" is always the foreground colour and
 * the second half always the accent; there is no logo artwork, only type.
 *
 * The mark is also the way in to `ShieldsReveal` — seven quick taps. Every
 * rule about that (how many taps, how slow is too slow, when the panel
 * opens) lives in `lib/domain/easter-egg.ts` and is tested there; this
 * component holds the state and hands each tap straight to it, with no
 * threshold or branch of its own.
 *
 * The handler goes on the mark's own span rather than wrapping it in a
 * button: a button would pick up the global pointer cursor, a focus ring and
 * a "button" announcement, which is a lot of signposting for something meant
 * to be found by accident. No call site wraps the wordmark in a link, so
 * these taps never had anywhere else to go. The reveal renders `fixed`, as a
 * sibling of the mark rather than a wrapper around it, so no screen the
 * wordmark sits on moves by a pixel whether it is open or not.
 */
export function Wordmark({ variant }: { variant: 'bar' | 'inline' | 'stacked' }) {
  const [egg, setEgg] = useState<EggState>(EGG_CLOSED)

  const onTap = useCallback(() => setEgg((s) => tapWordmark(s, Date.now())), [])
  const close = useCallback(() => setEgg(dismissReveal), [])

  const reveal = <ShieldsReveal open={egg.revealed} onClose={close} />

  if (variant === 'bar') {
    return (
      <>
        <span onClick={onTap} className="headline text-[17px] leading-none text-fg">
          SHED<span className="text-accent">HQ</span>
        </span>
        {reveal}
      </>
    )
  }

  if (variant === 'stacked') {
    return (
      <>
        <span onClick={onTap} className="headline block text-[64px] text-fg">
          Shed
          <br />
          <span className="text-accent">quarters</span>
        </span>
        {reveal}
      </>
    )
  }

  return (
    <>
      <span onClick={onTap} className="inline-flex flex-col items-center gap-2">
        <span className="headline text-[40px] text-fg">
          Shed<span className="text-accent">quarters</span>
        </span>
        <span className="eyebrow">Beer Die · Est. 2026</span>
      </span>
      {reveal}
    </>
  )
}
