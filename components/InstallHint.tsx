'use client'

import { useEffect, useState } from 'react'

const DISMISSED_KEY = 'shed.install-hint.dismissed'

type Mode = 'hidden' | 'ios' | 'prompt'

/** Chromium's install event; not in the DOM lib types. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function isDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Nudges people to put Shedquarters on their home screen. Hidden once the app
 * is installed (running standalone) or after it's dismissed on this phone.
 * iOS has no install API, so it gets written steps; Android gets a button.
 */
export function InstallHint() {
  const [mode, setMode] = useState<Mode>('hidden')
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone || isDismissed()) return

    const ua = navigator.userAgent
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
    // Deferred so the state update doesn't run synchronously inside the effect.
    if (isIos) queueMicrotask(() => setMode('ios'))

    function onPrompt(e: Event) {
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
      setMode('prompt')
    }
    function onInstalled() {
      setMode('hidden')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (mode === 'hidden') return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {}
    setMode('hidden')
  }

  return (
    <aside aria-label="Install Shedquarters" className="surface mt-3 mb-5 flex items-start gap-3 rounded-2xl p-3.5">
      <div className="flex-1">
        <p className="font-display text-[17px] font-extrabold uppercase italic leading-tight">
          Put it on your <span className="text-gold">home screen</span>
        </p>
        {mode === 'ios' ? (
          <p className="mt-1 text-[13px] leading-snug text-muted">
            In Safari, tap <span className="text-cream">Share</span>, then{' '}
            <span className="text-cream">Add to Home Screen</span>. It opens full-screen like an app.
          </p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await promptEvent?.prompt()
              setMode('hidden')
            }}
            className="mt-2 min-h-11 rounded-xl bg-gold px-4 font-display text-[16px] font-extrabold uppercase italic text-gold-ink"
          >
            Install app
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mt-1.5 -mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center text-[22px] text-faint"
      >
        ×
      </button>
    </aside>
  )
}
