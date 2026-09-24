'use client'

import { useEffect, useRef, useState } from 'react'
import { unstable_rethrow, useRouter } from 'next/navigation'
import type { Player } from '@/lib/queries'
import type { LogGameInput } from '@/lib/types'
import { applyGame, applyPending, type Table } from '@/lib/domain/table'
import {
  enqueue,
  flush,
  pending,
  pendingCount,
  dropLast,
  deadCount,
  clearDeadLettered,
} from '@/lib/client/queue'
import { voidLastGame, endSession, setTeams } from '@/lib/actions'
import { winnerScore, losersTax, deuceLine } from '@/lib/domain/score'
import { SPORT_RULES, isValidTarget, type Sport } from '@/lib/domain/sport'
import {
  loadTableState,
  saveTableState,
  clearTableState,
  clearSetupState,
  isTableStateCurrent,
  loadTarget,
  saveTarget,
  clearTarget,
} from '@/lib/client/persist'
import { TopBar } from '@/components/ui/TopBar'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { Sheet } from '@/components/ui/Sheet'
import { TeamButton } from '@/components/ui/TeamButton'
import { TeamSizeToggle, type TeamSize } from '@/components/ui/TeamSizeToggle'
import { TargetToggle } from '@/components/ui/SportSwitch'
import { LineupEditor } from '@/components/LineupEditor'
import {
  createLineup,
  droppedPlayers,
  emptyCount,
  fromStoredLineup,
  isComplete,
  resize,
  toStoredLineup,
  toTeams,
  type Lineup,
} from '@/lib/domain/lineup'

/**
 * How long "Undo last game" stays off after a game is logged. Logging swaps
 * the challengers screen for the "who won" screen in one render, and Undo
 * lands close to where "Log it" was, so the second tap of a double tap would
 * otherwise drop the game it just logged — with no confirm, and silently if
 * it was still queued. A second is longer than any double tap and shorter
 * than anyone takes to decide a game was logged wrong.
 */
export const UNDO_GRACE_MS = 1_000

type Phase =
  | { step: 'winner' }
  | { step: 'score'; winner: 'holders' | 'challengers' }
  | { step: 'challengers'; winner: 'holders' | 'challengers'; loserScore: number }
  | { step: 'teams' }

export function TableMode({
  sessionId,
  serverTable,
  sport,
  serverTarget,
  players,
}: {
  sessionId: string
  serverTable: Table
  sport: Sport
  /** The night's current target on the server: what the last game was played to. */
  serverTarget: number
  players: Player[]
}) {
  const router = useRouter()
  const rules = SPORT_RULES[sport]
  const [table, setTable] = useState<Table>(serverTable)
  // What the next game is being played to. Starts on the server's value and
  // is replaced by this phone's own pick, if it made one, once restored below.
  const [target, setTarget] = useState(serverTarget)
  const [phase, setPhase] = useState<Phase>({ step: 'winner' })
  const [picked, setPicked] = useState<string[]>([])
  const [queued, setQueued] = useState(0)
  const [syncFailing, setSyncFailing] = useState(false)
  const [dead, setDead] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [forceEnd, setForceEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [undoing, setUndoing] = useState(false)
  // Undo is held off for UNDO_GRACE_MS after every logged game; see above.
  const [justLogged, setJustLogged] = useState(false)
  const justLoggedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Scores past 21 are picked on a second pad instead of window.prompt.
  const [pastTarget, setPastTarget] = useState(false)
  // null means "not overridden yet" — the teams screen falls back to the
  // table's current lineup and size, computed fresh below. Set to a real
  // value by any edit on that screen; reset to null whenever the screen is
  // (re)opened so it always starts prefilled with who's on now.
  const [teamsLineup, setTeamsLineup] = useState<Lineup | null>(null)
  // The lineup editor's screen-reader live region. It lives here, not in
  // `LineupEditor`, because the 3v3 / 2v2 toggle sits in the top bar above
  // it: a size change is the one board operation the editor cannot see
  // itself making, and it is the one that can drop a player.
  const [teamsNotice, setTeamsNotice] = useState('')
  const [savingTeams, setSavingTeams] = useState(false)
  // Whether the phase-restore effect below has run. Gates the phase-save
  // effect so it never overwrites a stored session with this render's
  // still-default state before the restore has had a chance to read it.
  const [hydrated, setHydrated] = useState(false)
  const restoredPhaseRef = useRef(false)

  const requiredChallengers = table.holders.length

  // INVARIANT (must hold everywhere in this component): `serverTable`
  // reflects exactly the games that have been flushed to the server;
  // `pending()` holds exactly the games that have not. The table shown to
  // the user is always `applyPending(serverTable, pending())`. Anything
  // that moves a game out of the queue (a flush that actually sends, or a
  // server-side void) must therefore either keep `pending()` in sync
  // (flushing already does, by removing sent items) or pull a fresh
  // `serverTable` via `router.refresh()` — otherwise this effect recomputes
  // from a stale `serverTable` and the display desyncs from what is
  // actually persisted.
  useEffect(() => {
    // The queue lives in localStorage, outside React, so syncing from it on
    // a new `serverTable` is exactly the external-store case the rule allows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTable(applyPending(serverTable, pending()))
    setQueued(pendingCount())
    setDead(deadCount())
  }, [serverTable])

  // This component only ever renders once a session exists, so any pick
  // still sitting in SessionSetup's storage belongs to a game that never
  // started here — either abandoned on this phone, or overtaken by a
  // session someone else started first. `SessionSetup` already clears it on
  // a successful `startSession`, but that leaves the "someone else started
  // it" case with nothing to clear it — an abandoned pick would otherwise
  // survive indefinitely and resurface the next time this phone lands back
  // on SessionSetup, for a night that has nothing to do with it.
  useEffect(() => {
    clearSetupState()
  }, [])

  // Restore which screen was open and the challengers picked so far, after a
  // tab switch (Table ⇄ Ranks). Runs once, after mount, so the server-
  // rendered and first client paint match — restoring during render would be
  // a hydration mismatch. This is UI state only: it never feeds the offline
  // queue above, and a stale key from a different (e.g. already-ended)
  // session is never read, since restoring always asks for *this* sessionId.
  //
  // Session id alone is not enough, though: it identifies the *night*, not
  // the *table state* the phase was drawn over. Between this phone leaving
  // and coming back, another phone can log a game against the same session —
  // new holders, new challengers, a new seq — while this phone still has
  // "next 3 up" over a losing score that belongs to the game that just
  // happened. `serverTable.seq` is refetched fresh on every mount (this
  // component remounts on navigation back to /table), so comparing it to the
  // seq the phase was saved against is what tells a stale phase apart from a
  // live one. A mismatch falls back to the safe default rather than replaying
  // a picker over a table that no longer exists.
  useEffect(() => {
    if (restoredPhaseRef.current) return
    restoredPhaseRef.current = true
    const restored = loadTableState(sessionId)
    const current = isTableStateCurrent(restored, serverTable.seq)
    setPhase(current ? restored.phase : { step: 'winner' })
    setPicked(current ? restored.picked : [])
    // A half-finished board only comes back when the stored state passed the
    // seq check above — the table it was drawn over is still the table. An
    // older build's shape never gets here: `isStoredTableState` rejects it
    // outright, so `restored` is null and this falls back to the live table.
    setTeamsLineup(current && restored.lineup !== null ? fromStoredLineup(restored.lineup) : null)
    // The target outlives the phase: it's a choice about the next game, not
    // a screen in the middle of logging one.
    setTarget(loadTarget(sessionId, sport) ?? serverTarget)
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Keep it live from the moment the restore above has run. Once the phase
  // has settled back to its default (the "who won" screen with nothing
  // picked), there is nothing worth restoring later, so the stored state is
  // cleared rather than left to say the same thing forever.
  useEffect(() => {
    if (!hydrated) return
    if (phase.step === 'winner' && picked.length === 0) {
      clearTableState(sessionId)
    } else {
      // Only a board the user actually touched is worth storing: while
      // `teamsLineup` is still null the editor would rebuild the very same
      // lineup from the live table on its own.
      const lineup = teamsLineup === null ? null : toStoredLineup(teamsLineup)
      saveTableState(sessionId, { phase, picked, lineup, seq: serverTable.seq })
    }
  }, [hydrated, sessionId, phase, picked, teamsLineup, serverTable.seq])

  // Drain the queue, and whenever a drain actually sends something, refresh
  // so `serverTable` catches up — see the invariant above. A no-op flush
  // (nothing queued, or nothing sent) must stay silent: no refresh.
  //
  // Dead-lettering is the other way a game leaves the queue, and it is the
  // case `sent > 0` misses: the server refused the game, so `serverTable` is
  // already correct and does not change — but `table` still carries the
  // optimistic roster and runLength for a game that was never recorded, and
  // the `[serverTable]` effect will not re-run to correct it. Recompute the
  // same way undo() does for a game that never left the device: server state
  // plus whatever is still queued.
  //
  // `failed` is displayed, not discarded: a queue that cannot drain is the
  // one failure mode nobody at the table would otherwise notice until the
  // games were already gone.
  async function drain() {
    const deadBefore = deadCount()
    const { sent, failed } = await flush()
    const deadAfter = deadCount()
    setQueued(pendingCount())
    setDead(deadAfter)
    setSyncFailing(failed)
    if (deadAfter > deadBefore) setTable(applyPending(serverTable, pending()))
    if (sent > 0) router.refresh()
  }

  // A phase change must not let a destructive confirmation survive into a
  // different screen — otherwise arming "End session" and then tapping
  // "Who won?" leaves it armed for whatever the user taps next.
  function goTo(next: Phase) {
    setConfirmEnd(false)
    setForceEnd(false)
    setPhase(next)
  }

  // Drain on load, on reconnect, and on a slow timer.
  useEffect(() => {
    const tick = () => {
      void drain()
    }
    // drain() only sets state after the network round trip resolves; the
    // rule cannot see through the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void drain()
    window.addEventListener('online', tick)
    const id = setInterval(tick, 15_000)
    return () => {
      window.removeEventListener('online', tick)
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      if (justLoggedTimer.current) clearTimeout(justLoggedTimer.current)
    },
    [],
  )

  const name = (id: string) => players.find((p) => p.id === id)?.displayName ?? '?'

  function changeTarget(next: number) {
    if (!isValidTarget(sport, next)) return
    setTarget(next)
    saveTarget(sessionId, next)
  }

  function log(winner: 'holders' | 'challengers', loserScore: number) {
    setError(null)
    // The target travels with the game, so a game that waits in the queue
    // is still recorded as what it was played to, whatever gets picked next.
    const item: LogGameInput = {
      clientId: crypto.randomUUID(),
      sessionId,
      winner,
      loserScore,
      nextChallengers: picked,
      targetScore: target,
    }
    enqueue(item)
    setJustLogged(true)
    if (justLoggedTimer.current) clearTimeout(justLoggedTimer.current)
    justLoggedTimer.current = setTimeout(() => setJustLogged(false), UNDO_GRACE_MS)
    setTable((t) => applyGame(t, winner, picked))
    setPicked([])
    goTo({ step: 'winner' })
    setQueued(pendingCount())
    void drain()
  }

  async function undo() {
    if (undoing || justLogged) return
    setError(null)
    setConfirmEnd(false)
    setUndoing(true)
    try {
      // If it never left the device, drop it from the local queue and derive
      // the restored table from server state + whatever is still queued —
      // there is no local history to roll back to (it would be stale after
      // a reload).
      const dropped = dropLast()
      if (dropped) {
        setTable(applyPending(serverTable, pending()))
        setQueued(pendingCount())
        return
      }
      // Already flushed to the server: void it there, then refresh so the
      // server component re-fetches getActiveTable() and the [serverTable]
      // effect above picks up the restored state. Held behind `undoing` for
      // the whole duration so a double-tap can't re-enter this branch and
      // void a second, unrelated game.
      await voidLastGame(sessionId)
      router.refresh()
      setQueued(pendingCount())
    } catch (e) {
      // The gate redirects a signed-out phone by throwing; let that through.
      unstable_rethrow(e)
      // A server error's real message never reaches the client anyway (only a
      // digest), and the raw text of the ones that do is no use at a table.
      console.error('undo failed', e)
      setError("Couldn't undo that one. Check the wifi and try again.")
    } finally {
      setUndoing(false)
    }
  }

  async function confirmedEndSession(force: boolean) {
    setError(null)
    setEnding(true)
    try {
      // Ending first would strand the queue permanently: logGame rejects a
      // write to an ended session with a 400, which is terminal, so every
      // still-queued game would be dead-lettered instead of recorded. Drain
      // first, and only end once nothing is left waiting.
      //
      // Dead-lettered games count here as well. If the pre-end drain refuses
      // the queue rather than sending it, `pendingCount()` reaches 0 while
      // those games were never recorded — the exact outcome this check
      // exists to prevent, arriving by a different route.
      await drain()
      const stranded = pendingCount() + deadCount()
      if (stranded > 0 && !force) {
        setError(
          `${stranded} game${stranded > 1 ? 's' : ''} never reached the server. ` +
            'Check the wifi and try again — ending now would lose them.',
        )
        // Arm the second confirmation rather than closing the panel. A queue
        // that genuinely cannot drain would otherwise leave no way to end the
        // session at all; the escape hatch is fine as long as it names the cost.
        setForceEnd(true)
        return
      }
      await endSession(sessionId)
      // The phase being restored belongs to a night that is now over.
      clearTableState(sessionId)
      clearTarget(sessionId)
    } catch (e) {
      // The gate redirects a signed-out phone by throwing; let that through.
      unstable_rethrow(e)
      console.error('end session failed', e)
      setError("Couldn't end the night. Check the wifi and try again.")
      setConfirmEnd(false)
      setForceEnd(false)
    } finally {
      setEnding(false)
    }
  }

  // Prefilled with who is currently on: the live holders in the holding
  // column, the live challengers facing them. `teamsLineup` is null until
  // the user edits something, so this always starts from the live table
  // rather than a stale board left over from a previous visit.
  const effectiveTeamsLineup: Lineup =
    teamsLineup ?? createLineup(requiredChallengers as TeamSize, table.holders, table.challengers)

  function openTeamsEditor() {
    setError(null)
    setTeamsLineup(null)
    setTeamsNotice('')
    goTo({ step: 'teams' })
  }

  // Switching 3v3 ⇄ 2v2 keeps whoever still fits on their own side rather
  // than clearing the board, so flipping the toggle to look and flipping it
  // back doesn't cost the lineup you already built.
  function changeTeamsSize(next: TeamSize) {
    const before = effectiveTeamsLineup
    const after = resize(before, next)
    // `resize` hands back the very same lineup when the size did not move.
    // Bail on that: writing it would announce a non-event, and would flip
    // `teamsLineup` from null to a snapshot, which is what the save effect
    // above reads as "the user touched this board" and starts persisting.
    if (after === before) return
    setTeamsLineup(after)
    // Shrinking can leave someone with nowhere to stand. That happens up in
    // the top bar, nowhere near the board, so say who came off.
    const dropped = droppedPlayers(before, after).map(name)
    setTeamsNotice(
      `Now ${next} on ${next}. ` +
        (dropped.length === 0
          ? 'Nobody came off the board.'
          : `No room for ${dropped.join(' and ')} — off the board.`),
    )
  }

  // Changing teams mid-session never touches a `games` row — history keeps
  // the teams it was played with, so past ratings and the run shown on the
  // table are unaffected by a lineup change. Only the session's current
  // holders/challengers move.
  async function saveTeams() {
    if (savingTeams) return
    // A board with a hole in it has no teams to write. The Save button is
    // already disabled for it; this is the same rule stated where it would
    // actually do damage.
    const teams = toTeams(effectiveTeamsLineup)
    if (teams === null) return
    setError(null)
    setSavingTeams(true)
    try {
      // A half-synced queue would desync what the server thinks is on the
      // table from what the queue is about to send once it does drain — the
      // same reason `confirmedEndSession` drains before writing. Concretely:
      // `logGame` stamps a game's team_a/team_b from whatever
      // `sessions.holders`/`challengers` say *at drain time*, not at the
      // moment it was tapped in at the table. If a queued game drained after
      // this wrote a new lineup, it would be recorded under the new teams —
      // a fabricated result for whoever actually played it. Unlike ending
      // the night, there is no forced write here to work around that: a
      // lineup change can always wait for the wifi, so refuse rather than
      // risk it.
      await drain()
      const stillPending = pendingCount()
      const stillDead = deadCount()
      // Two different failures need two different advice. A pending game is
      // still trying — "check the wifi" is the right and only fix. A
      // dead-lettered one already got a definitive no from the server;
      // retrying it here would refuse forever, and the one place to act on
      // it (Dismiss, or re-enter it) is the banner on the previous screen,
      // not this one.
      if (stillPending > 0) {
        setError(
          `${stillPending} game${stillPending > 1 ? 's' : ''} never reached the server. ` +
            'Check the wifi and try again — changing teams now would lose track of them.',
        )
        return
      }
      if (stillDead > 0) {
        setError(
          `${stillDead} game${stillDead > 1 ? 's' : ''} the server rejected outright — retrying won't change that. ` +
            `Go back and Dismiss or re-enter ${stillDead > 1 ? 'them' : 'it'} before changing teams.`,
        )
        return
      }
      await setTeams(sessionId, teams.holders, teams.challengers, effectiveTeamsLineup.size)
      // Not a game: there is no local `applyGame` to fold in. Refresh so the
      // server component re-fetches getActiveTable() and the [serverTable]
      // effect above picks up the new lineup, the same way undo() does.
      router.refresh()
      setTeamsLineup(null)
      setTeamsNotice('')
      goTo({ step: 'winner' })
    } catch (e) {
      // The gate redirects a signed-out phone by throwing; let that through.
      unstable_rethrow(e)
      console.error('change teams failed', e)
      setError("Couldn't change teams. Check the wifi and try again.")
    } finally {
      setSavingTeams(false)
    }
  }

  // "all synced" must only ever mean it. A drain that failed is called out
  // rather than folded into a neutral-looking count — and so is a game the
  // server refused, which leaves the queue empty without ever being recorded.
  const unsent = queued + dead
  const armedToDiscard = forceEnd && unsent > 0
  const status =
    queued > 0
      ? `${queued} game${queued > 1 ? 's' : ''} waiting to sync${syncFailing ? " — can't reach the server" : ''}`
      : dead > 0
        ? `${dead} game${dead > 1 ? 's' : ''} not recorded`
        : 'all synced'

  // The losing scores a plain win can end on (0 to 19 for a game to 21), and
  // twenty past that for a game that went to deuce. A 25-point game has 24
  // plain scores, which sit better six to a row than five.
  const plainScores = [...Array(deuceLine(target) + 1).keys()]
  const deuceScores = [...Array(20).keys()].map((n) => n + deuceLine(target) + 1)
  const plainCols = plainScores.length % 6 === 0 ? 'grid-cols-6' : 'grid-cols-5'
  const plainSpan = plainScores.length % 6 === 0 ? 'col-span-6' : 'col-span-5'

  // The "who won" view is also shown behind the score sheet.
  if (phase.step === 'winner' || phase.step === 'score') {
    const scoring = phase.step === 'score' ? phase.winner : null
    const winnerNames = scoring ? (scoring === 'holders' ? table.holders : table.challengers).map(name) : []

    return (
      <main>
        <TopBar
          live
          right={
            <span className={`text-[12px] ${syncFailing || dead > 0 ? 'text-down' : 'text-muted'}`}>
              <span
                aria-hidden
                className={`mr-1.5 inline-block h-[7px] w-[7px] rounded-full ${syncFailing || dead > 0 ? 'bg-down' : queued > 0 ? 'bg-gold' : 'bg-up'}`}
              />
              {status}
            </span>
          }
        />

        {/* A dead-lettered game was logged at the table and permanently
            refused by the server. It is off the queue so it can't block
            anything, but it was never recorded — say so while somebody is
            still standing here to re-enter it. */}
        {dead > 0 && (
          <div
            role="alert"
            className="mb-2.5 rounded-xl border border-gold/50 bg-gradient-to-r from-cardinal-hi to-cardinal-deep px-3 py-2.5 text-[12.5px] leading-snug"
          >
            <span className="block font-display text-[15px] font-extrabold uppercase tracking-[0.04em]">
              {dead} game{dead > 1 ? 's' : ''} not recorded
            </span>
            {dead > 1 ? 'They were' : 'It was'} rejected by the server. Re-enter {dead > 1 ? 'them' : 'it'} if it
            still matters.
            <button
              type="button"
              onClick={() => {
                clearDeadLettered()
                setDead(0)
              }}
              className="ml-2 min-h-11 rounded-md border border-cream/40 px-3 text-[12px] font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mb-2.5 rounded-xl border border-down/45 bg-cardinal-hi/25 px-3 py-2 text-[13px]">
            {error}
          </p>
        )}

        <div className="mt-1 mb-3 flex items-center gap-3">
          <h1 className="headline py-0.5 text-[38px]">
            Who <span className="text-gold">won?</span>
          </h1>
          {table.runLength > 0 && (
            <span className="ml-auto">
              <Pill tone="gold">
                {table.runLength} game run
              </Pill>
            </span>
          )}
        </div>

        {rules.targets.length > 1 && (
          <div className="mb-3">
            <TargetToggle sport={sport} target={target} onChange={changeTarget} />
          </div>
        )}

        <TeamButton
          label={`Holding the ${rules.holds}`}
          names={table.holders.map(name)}
          holding
          ghost={table.runLength > 0 ? String(table.runLength) : undefined}
          onClick={() => goTo({ step: 'score', winner: 'holders' })}
        />
        <p aria-hidden className="my-2 flex items-center gap-3 text-faint">
          <span className="h-px flex-1 bg-gold/10" />
          <span className="headline text-[15px] leading-none">VS</span>
          <span className="h-px flex-1 bg-gold/10" />
        </p>
        <TeamButton
          label="Challengers"
          names={table.challengers.map(name)}
          holding={false}
          onClick={() => goTo({ step: 'score', winner: 'challengers' })}
        />

        <div className="mt-8 flex gap-2">
          <Button tone="ghost" size="md" className="flex-1" onClick={undo} disabled={undoing || justLogged}>
            {undoing ? 'Undoing…' : '↶ Undo last game'}
          </Button>
          <Button tone="ghost" size="md" className="flex-1" onClick={openTeamsEditor} disabled={undoing || ending}>
            Change teams
          </Button>
        </div>

        {/* Kept visually separate from Undo — a destructive, confirmed action
            should not sit adjacent to a routine same-sized control. */}
        <div className="mt-12 flex justify-end border-t border-gold/10 pt-4">
          {confirmEnd ? (
            <div className="flex w-full flex-col gap-2">
              <p className="text-[13px] text-muted">
                {armedToDiscard ? 'Those games cannot be recovered.' : 'End the night for good?'}
              </p>
              <div className="flex gap-2">
                <Button
                  tone="ghost"
                  size="md"
                  onClick={() => {
                    setConfirmEnd(false)
                    setForceEnd(false)
                  }}
                  disabled={ending}
                >
                  Keep playing
                </Button>
                <Button tone="cardinal" size="md" onClick={() => void confirmedEndSession(armedToDiscard)} disabled={ending}>
                  {ending
                    ? 'Ending…'
                    : armedToDiscard
                      ? `End anyway, discarding ${unsent} unsent game${unsent > 1 ? 's' : ''}`
                      : 'End it'}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="min-h-11 px-2 font-display text-[13px] font-bold uppercase tracking-[0.14em] text-faint"
            >
              End the night
            </button>
          )}
        </div>

        <Sheet
          open={scoring !== null}
          label="Losing score"
          onClose={() => {
            setPastTarget(false)
            goTo({ step: 'winner' })
          }}
        >
          <p className="eyebrow text-gold">{winnerNames.join(' · ')} won</p>
          <div className="mt-1 flex items-end">
            <h2 className="headline text-[34px]">
              Losing <span className="text-gold">score?</span>
            </h2>
            <span className="ml-auto font-mono text-[26px] font-bold">
              {pastTarget ? (
                <span className="font-display text-[15px] uppercase tracking-[0.1em] text-gold">Win by 2</span>
              ) : (
                <>
                  {target}–<span className="text-gold">?</span>
                </>
              )}
            </span>
          </div>
          {/* Win by 2 means the losing score decides the whole final, but only
              past the deuce line is that non-obvious — so spell the rule out there. */}
          <p className="mb-3 text-[13px] leading-snug text-muted">
            {pastTarget
              ? `Nobody closed it out at ${target}, so the winner takes it two clear. Tap what the losers finished on.`
              : `Winner gets ${target}. Tap what the losers finished on.`}
          </p>
          <div className={`grid gap-1.5 ${pastTarget ? 'grid-cols-4' : plainCols}`}>
            {(pastTarget ? deuceScores : plainScores).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  if (!scoring) return
                  setPastTarget(false)
                  goTo({ step: 'challengers', winner: scoring, loserScore: n })
                }}
                className="surface flex min-h-12 flex-col items-center justify-center rounded-[10px] font-display font-extrabold"
              >
                <span className="text-[22px] leading-none">{n}</span>
                {pastTarget && (
                  <span className="mt-0.5 font-mono text-[11px] font-bold text-gold">
                    {winnerScore(n, target)}–{n}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPastTarget((d) => !d)}
              className={`min-h-12 rounded-[10px] border border-gold/35 font-display text-[15px] font-extrabold uppercase tracking-[0.06em] text-gold ${pastTarget ? 'col-span-4' : plainSpan}`}
            >
              {pastTarget
                ? `← Back to 0–${deuceLine(target)}`
                : `Went past ${target} · score ${deuceLine(target) + 1}+`}
            </button>
          </div>
        </Sheet>
      </main>
    )
  }

  if (phase.step === 'teams') {
    const teamsReady = isComplete(effectiveTeamsLineup)
    const stillEmpty = emptyCount(effectiveTeamsLineup)

    return (
      <main>
        <TopBar
          live
          right={
            // Spikeball is 2v2 only, so there is no size to change.
            rules.teamSizes.length > 1 ? (
              <TeamSizeToggle size={effectiveTeamsLineup.size} onChange={changeTeamsSize} />
            ) : undefined
          }
        />

        <h1 className="headline mt-3 text-[40px]">
          Change <span className="text-gold">teams</span>
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Tap a slot, then tap who goes in it. ⇄ sends two players across.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-down/45 bg-cardinal-hi/25 px-3 py-2 text-[13px]">
            {error}
          </p>
        )}

        <LineupEditor
          players={players}
          lineup={effectiveTeamsLineup}
          onChange={setTeamsLineup}
          announcement={teamsNotice}
          onAnnounce={setTeamsNotice}
        />

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-6 flex gap-2">
          <Button
            tone="ghost"
            size="lg"
            className="flex-1"
            onClick={() => {
              setTeamsLineup(null)
              setTeamsNotice('')
              goTo({ step: 'winner' })
            }}
            disabled={savingTeams}
          >
            Cancel
          </Button>
          <Button className="flex-[2]" disabled={!teamsReady || savingTeams} onClick={() => void saveTeams()}>
            {savingTeams ? 'Saving…' : teamsReady ? 'Save teams →' : `Fill ${stillEmpty} more`}
          </Button>
        </div>
      </main>
    )
  }

  // Winners stay on the table, so they are not selectable as challengers.
  const staying = phase.winner === 'holders' ? table.holders : table.challengers
  const available = players.filter((p) => !staying.includes(p.id))
  // Display only, and only on this screen: derived from the losing score
  // that is already in `phase`, written nowhere, and read by nothing that
  // logs a game. `log()` below is untouched — the game that gets enqueued
  // and rated is exactly the game that would have been without this line.
  const tax = losersTax(phase.loserScore, target)

  return (
    <main>
      <TopBar live />
      <Pill tone="gold">
        Final {winnerScore(phase.loserScore, target)}–{phase.loserScore}
      </Pill>
      {tax && <p className="mt-2 text-[13px] leading-snug font-semibold text-gold">{tax}</p>}
      <h1 className="headline mt-3 text-[40px]">
        Next {requiredChallengers} <span className="text-gold">up</span>
      </h1>
      <p className="mt-2 text-[13px] text-muted">
        {staying.map(name).join(' · ')} stay on. Pick who&apos;s challenging.
      </p>

      <ul className="mt-4 flex flex-wrap gap-1.5">
        {available.map((p) => {
          const on = picked.includes(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPicked((cur) =>
                    cur.includes(p.id)
                      ? cur.filter((x) => x !== p.id)
                      : cur.length < requiredChallengers
                        ? [...cur, p.id]
                        : cur,
                  )
                }
                className={`min-h-11 rounded-full border px-4 font-display text-[17px] font-bold uppercase ${on ? 'border-gold bg-gold text-gold-ink' : 'surface'}`}
              >
                {p.displayName}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-6">
        <Button disabled={picked.length !== requiredChallengers} onClick={() => log(phase.winner, phase.loserScore)}>
          {picked.length === requiredChallengers ? 'Log it →' : `Pick ${requiredChallengers - picked.length} more`}
        </Button>
      </div>
    </main>
  )
}
