'use client'

import { useEffect, useRef, useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import type { Player } from '@/lib/queries'
import { startSession } from '@/lib/actions'
import { TopBar } from '@/components/ui/TopBar'
import { Button } from '@/components/ui/Button'
import { TeamSizeToggle, type TeamSize } from '@/components/ui/TeamSizeToggle'
import { TeamPicker } from '@/components/TeamPicker'
import { SportToggle, TargetToggle } from '@/components/ui/SportSwitch'
import { loadSetupState, saveSetupState, clearSetupState } from '@/lib/client/persist'
import { DEFAULT_SPORT, SPORT_RULES, type Sport } from '@/lib/domain/sport'

export function SessionSetup({ players }: { players: Player[] }) {
  const [sport, setSport] = useState<Sport>(DEFAULT_SPORT)
  const [target, setTarget] = useState(SPORT_RULES[DEFAULT_SPORT].defaultTarget)
  const [size, setSize] = useState<TeamSize>(3)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  // Whether the restore effect below has run. Gates the save effect so it
  // never fires on this render's still-default state before the restore has
  // had a chance to read what was actually stored.
  const [hydrated, setHydrated] = useState(false)
  const restoredRef = useRef(false)

  const needed = size * 2
  const sizes = SPORT_RULES[sport].teamSizes

  function changeSize(next: TeamSize) {
    setSize(next)
    setPicked([])
  }

  // A different game can mean a different team size (spikeball is 2v2
  // only), so the pick starts over rather than keeping a half-built 3v3.
  function changeSport(next: Sport) {
    const rules = SPORT_RULES[next]
    setSport(next)
    setTarget(rules.defaultTarget)
    if (!rules.teamSizes.includes(size)) {
      setSize(rules.teamSizes[0])
      setPicked([])
    }
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < needed ? [...p, id] : p))
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
    const restoredSport = restored?.sport ?? DEFAULT_SPORT
    const rules = SPORT_RULES[restoredSport]
    const restoredSize = restored?.size ?? 3
    const sizeFits = rules.teamSizes.includes(restoredSize)
    setSport(restoredSport)
    setTarget(restored?.target ?? rules.defaultTarget)
    setSize(sizeFits ? restoredSize : rules.teamSizes[0])
    setPicked(sizeFits ? (restored?.picked ?? []) : [])
    setHydrated(true)
  }, [])

  // Keep it live from the moment the restore above has run, so a tab switch
  // mid-pick is never lost. UI convenience only: startSession below takes the
  // selection as plain arguments, so this is never a second source of truth
  // for what actually gets sent to the server.
  useEffect(() => {
    if (!hydrated) return
    saveSetupState({ picked, size, sport, target })
  }, [hydrated, picked, size, sport, target])

  const ready = picked.length === needed

  async function handleStart() {
    setError(null)
    setStarting(true)
    try {
      await startSession(picked.slice(0, size), picked.slice(size, needed), {
        gameType: sport,
        targetScore: target,
      })
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
      <TopBar
        right={
          sizes.length > 1 ? (
            <TeamSizeToggle size={size} onChange={changeSize} />
          ) : (
            <span className="font-display text-[15px] font-extrabold text-gold">
              {size}V{size}
            </span>
          )
        }
      />

      <h1 className="headline mt-2 text-[42px]">
        Start a <span className="text-gold">game</span>
      </h1>

      <div className="mt-3 flex flex-col gap-2">
        <SportToggle sport={sport} onChange={changeSport} />
        <TargetToggle sport={sport} target={target} onChange={setTarget} />
      </div>

      <p className="mt-3 text-[13px] text-muted">
        Tap names in order: the first {size} hold the {SPORT_RULES[sport].holds}.
      </p>

      <TeamPicker players={players} size={size} holds={SPORT_RULES[sport].holds} picked={picked} onToggle={toggle} onClear={() => setPicked([])} />

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-down/45 bg-cardinal-hi/25 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-6">
        <Button disabled={!ready || starting} onClick={handleStart}>
          {starting ? 'Starting…' : ready ? 'Game on →' : `Pick ${needed - picked.length} more`}
        </Button>
      </div>
    </main>
  )
}
