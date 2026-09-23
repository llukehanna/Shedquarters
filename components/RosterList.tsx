'use client'

import { useRef, useState, useTransition } from 'react'
import { unstable_rethrow } from 'next/navigation'
import type { Player } from '@/lib/queries'
import { renamePlayer, addNickname, removeNickname } from '@/lib/actions'
import { Sheet } from '@/components/ui/Sheet'
import { Pill } from '@/components/ui/Pill'

const MAX_LENGTH = 40
const MAX_NICKNAMES = 6

/**
 * The roster list on the Me tab, with a per-row edit affordance that opens a
 * bottom sheet for renaming a player and piling nicknames onto them. Anyone
 * signed in can edit anyone — the same trust model as the rest of the app,
 * where anyone can fix a logged result.
 */
export function RosterList({ players }: { players: Player[] }) {
  const [editing, setEditing] = useState<Player | null>(null)
  const [nicknames, setNicknames] = useState<string[]>([])
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [nickInput, setNickInput] = useState('')
  const [nickError, setNickError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const nickInputRef = useRef<HTMLInputElement>(null)

  function openEditor(player: Player) {
    setEditing(player)
    setName(player.displayName)
    setNicknames(player.nicknames)
    setNickInput('')
    setNameError(null)
    setNickError(null)
  }

  function close() {
    if (pending) return
    setEditing(null)
  }

  function saveName() {
    if (!editing || pending) return
    setNameError(null)
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNameError('Name can’t be empty.')
      return
    }
    if (trimmed.length > MAX_LENGTH) {
      setNameError(`Keep it to ${MAX_LENGTH} characters or fewer.`)
      return
    }
    if (trimmed === editing.displayName) return

    const id = editing.id
    startTransition(async () => {
      try {
        const renamed = await renamePlayer(id, trimmed)
        if (!renamed) {
          setNameError(`“${trimmed}” is already on the roster.`)
          return
        }
        setEditing({ ...editing, displayName: trimmed })
      } catch (e) {
        unstable_rethrow(e)
        console.error('rename failed', e)
        setNameError('Something went wrong — try again.')
      }
    })
  }

  function addNick() {
    if (!editing || pending) return
    setNickError(null)
    const trimmed = nickInput.trim()
    if (trimmed.length === 0) return
    if (trimmed.length > MAX_LENGTH) {
      setNickError(`Keep it to ${MAX_LENGTH} characters or fewer.`)
      return
    }
    if (nicknames.length >= MAX_NICKNAMES) {
      setNickError(`Six nicknames is the cap — remove one first.`)
      return
    }
    if (nicknames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setNickError(`Already has “${trimmed}”.`)
      return
    }

    const id = editing.id
    startTransition(async () => {
      try {
        const added = await addNickname(id, trimmed)
        if (!added) {
          setNickError(`Couldn’t add “${trimmed}”.`)
          return
        }
        setNicknames((prev) => [...prev, trimmed])
        setNickInput('')
        // Stays focused and clears rather than closing the sheet — someone
        // adding several nicknames in a row shouldn't have to reopen it.
        nickInputRef.current?.focus()
      } catch (e) {
        unstable_rethrow(e)
        console.error('add nickname failed', e)
        setNickError('Something went wrong — try again.')
      }
    })
  }

  function removeNick(nickname: string) {
    if (!editing || pending) return
    setNickError(null)
    const id = editing.id
    startTransition(async () => {
      try {
        await removeNickname(id, nickname)
        setNicknames((prev) => prev.filter((n) => n !== nickname))
      } catch (e) {
        unstable_rethrow(e)
        console.error('remove nickname failed', e)
        setNickError('Something went wrong — try again.')
      }
    })
  }

  return (
    <>
      <ul className="surface mt-4 rounded-2xl px-3">
        {players.map((p) => (
          <li key={p.id} className="flex min-h-11 items-center border-b border-gold/8 last:border-b-0">
            <span className="flex-1 py-1">
              <span className="block font-display text-[17px] font-bold uppercase">{p.displayName}</span>
              {p.nicknames.length > 0 && (
                <span className="block text-[12px] text-cream/60">
                  {p.nicknames.map((n) => `“${n}”`).join(' · ')}
                </span>
              )}
            </span>
            {!p.isHousemate && <Pill tone="dim">Guest</Pill>}
            <button
              type="button"
              onClick={() => openEditor(p)}
              aria-label={`Edit ${p.displayName}`}
              className="ml-3 flex min-h-11 min-w-11 items-center justify-center text-[13px] font-bold uppercase tracking-[0.08em] text-muted"
            >
              Edit
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={editing !== null} onClose={close} label={editing ? `Edit ${editing.displayName}` : 'Edit player'}>
        {editing && (
          <div className="grid gap-4 pb-2">
            <h2 className="headline text-[26px]">Edit player</h2>

            <div>
              <label htmlFor="edit-name" className="eyebrow text-gold">
                Name
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="edit-name"
                  value={name}
                  onChange={(e) => {
                    setNameError(null)
                    setName(e.target.value)
                  }}
                  autoComplete="off"
                  className="min-h-12 flex-1 rounded-[10px] border border-gold/15 bg-black/30 px-3 text-[17px] text-cream placeholder:text-faint focus:border-gold focus:outline-none"
                />
                <button
                  type="button"
                  onClick={saveName}
                  disabled={pending || name.trim() === editing.displayName}
                  className="flex min-h-12 items-center justify-center rounded-xl bg-gold px-4 font-display text-[15px] font-extrabold uppercase italic text-gold-ink disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted">Up to {MAX_LENGTH} characters.</p>
              {nameError && (
                <p role="alert" className="mt-2 rounded-xl border border-down/45 bg-cardinal-hi/25 px-3 py-2 text-[13px]">
                  {nameError}
                </p>
              )}
            </div>

            <div className="border-t border-gold/15 pt-3">
              <label htmlFor="edit-nickname" className="eyebrow text-gold">
                Nicknames <span className="normal-case text-muted">(optional, up to {MAX_NICKNAMES})</span>
              </label>

              {nicknames.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
                  {nicknames.map((n) => (
                    <li key={n} className="flex items-center gap-1 rounded-full border border-gold/25 bg-black/25 py-1 pl-3 pr-1.5">
                      <span className="text-[13px] text-cream">{n}</span>
                      {/*
                        The pill itself stays visually tiny (matches the
                        broadcast look's compact chips), but the tap target
                        must still clear 44px on the interactive element
                        itself. The `before:` pseudo-element is an invisible
                        44x44 hit area centered on the visible glyph via
                        absolute positioning — it overflows the button's own
                        box without adding any layout size, so the pill's
                        rendered footprint is unchanged. Extra gap on the
                        wrapping <ul> keeps that overflow from reaching a
                        neighboring pill.
                      */}
                      <button
                        type="button"
                        onClick={() => removeNick(n)}
                        disabled={pending}
                        aria-label={`Remove nickname ${n}`}
                        className="relative flex h-5 w-5 items-center justify-center rounded-full text-[13px] font-bold text-cream/60 disabled:opacity-40 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex gap-2">
                <input
                  id="edit-nickname"
                  ref={nickInputRef}
                  value={nickInput}
                  onChange={(e) => {
                    setNickError(null)
                    setNickInput(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addNick()
                    }
                  }}
                  autoComplete="off"
                  placeholder="Add a nickname"
                  disabled={pending || nicknames.length >= MAX_NICKNAMES}
                  className="min-h-12 flex-1 rounded-[10px] border border-gold/15 bg-black/30 px-3 text-[17px] text-cream placeholder:text-faint focus:border-gold focus:outline-none disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={addNick}
                  disabled={pending || nickInput.trim().length === 0 || nicknames.length >= MAX_NICKNAMES}
                  className="flex min-h-12 items-center justify-center rounded-xl bg-gold px-4 font-display text-[15px] font-extrabold uppercase italic text-gold-ink disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted">Up to {MAX_LENGTH} characters each.</p>
              {nickError && (
                <p role="alert" className="mt-2 rounded-xl border border-down/45 bg-cardinal-hi/25 px-3 py-2 text-[13px]">
                  {nickError}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="flex min-h-11 items-center justify-center font-display text-[13px] font-bold uppercase tracking-[0.14em] text-cream/60 disabled:opacity-40"
            >
              Done
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}
