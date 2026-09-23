'use client'

import { useEffect, useRef, useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import type { Player } from '@/lib/queries'
import { startSession } from '@/lib/actions'
import { TopBar } from '@/components/ui/TopBar'
import { Button } from '@/components/ui/Button'
import { TeamSizeToggle, type TeamSize } from '@/components/ui/TeamSizeToggle'
import { TeamPicker } from '@/components/TeamPicker'
import { loadSetupState, saveSetupState, clearSetupState } from '@/lib/client/persist'

export function SessionSetup({ players }: { players: Player[] }) {
  const [size, setSize] = useState<TeamSize>(3)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  // Whether the restore effect below has run. Gates the save effect so it
  // never fires on this render's still-default state before the restore has
  // had a chance to read what was actually stored.
  const [hydrated, setHydrated] = useState(false)
  const restoredRef = useRef(false)

  const target = size * 2

  function changeSize(next: TeamSize) {
    setSize(next)
    setPicked([])
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < target ? [...p, id] : p))
  }

  // Restore the in-progress pick after a tab switch (Table ⇄ Ranks). Runs
  // once, after mount, so the server-rendered and first client paint match —
  // restoring during render here would be a hydration mismatch. No session
  // exists yet at this screen, so there is nothing to key the stored state
  // on.
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const restored = loadSetupState()
    setSize(restored?.size ?? 3)
    setPicked(restored?.picked ?? [])
    setHydrated(true)
  }, [])

  // Keep it live from the moment the restore above has run, so a tab switch
  // mid-pick is never lost. UI convenience only: startSession below takes the
  // selection as plain arguments, so this is never a second source of truth
  // for what actually gets sent to the server.
  useEffect(() => {
    if (!hydrated) return
    saveSetupState({ picked, size })
  }, [hydrated, picked, size])

  const ready = picked.length === target

  async function handleStart() {
    setError(null)
    setStarting(true)
    try {
      await startSession(picked.slice(0, size), picked.slice(size, target))
      // The pick belongs to setup, not to the game that just started.
      clearSetupState()
    } catch (e) {
      // A signed-out phone is redirected to the gate by the action; that
      // redirect travels as a thrown error and must not be swallowed here.
      unstable_rethrow(e)
      // Server errors arrive as an opaque digest, so there is nothing worth
      // showing — say what happened in words that help at the table.
      console.error('start session failed', e)
      setError("Couldn't start the game. Check the wifi and try again.")
    } finally {
      setStarting(false)
    }
  }

  return (
    <main>
      <TopBar right={<TeamSizeToggle size={size} onChange={changeSize} />} />

      <h1 className="headline mt-2 text-[42px]">
        Start a <span className="text-gold">game</span>
      </h1>
      <p className="mt-2 text-[13px] text-muted">Tap names in order: the first {size} hold the table.</p>

      <TeamPicker players={players} size={size} picked={picked} onToggle={toggle} onClear={() => setPicked([])} />

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-down/45 bg-cardinal-hi/25 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-6">
        <Button disabled={!ready || starting} onClick={handleStart}>
          {starting ? 'Starting…' : ready ? 'Game on →' : `Pick ${target - picked.length} more`}
        </Button>
      </div>
    </main>
  )
}
