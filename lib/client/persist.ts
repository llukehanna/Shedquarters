'use client'

/**
 * Per-tab UI convenience state — which screen you had open, who you'd
 * picked — persisted across a tab switch (Table ⇄ Ranks) so it isn't lost
 * just because the client component unmounted.
 *
 * This is display state only. It is never read by the offline write queue
 * (`lib/client/queue.ts`) or by any server action — it only ever reconstructs
 * what the screen looked like, the same way the user's own taps would have.
 * Every read is wrapped in try/catch and validated before use: storage throws
 * in private mode, can be edited by hand, and can simply be empty, and the
 * screen must render correctly in every one of those cases.
 */

import { isStoredLineup, type StoredLineup } from '@/lib/domain/lineup'
import { isSport, isValidTarget, type Sport } from '@/lib/domain/sport'

const SETUP_KEY = 'house-ladder-setup'
const TABLE_KEY_PREFIX = 'house-ladder-table:'
const TARGET_KEY_PREFIX = 'house-ladder-target:'

/**
 * Bumped whenever the stored table state changes shape.
 *
 * Phones keep this app open for weeks — a home-screen PWA is never
 * "reloaded" in the way a tab is — so a phone that has not picked up a
 * deploy can write the *previous* shape and then read it back under the new
 * code. Version 1 stored the "Change teams" lineup as one ordered flat list
 * of ids under `picked`, where a player's team was decided by their
 * position in the list; version 2 stores addressable slots instead. The two
 * are not translatable: an old `picked` restored into the new editor would
 * fill the board by tap order again, which is the bug this screen was
 * rebuilt to remove. Mismatched versions are therefore a cache miss and
 * nothing else — the screen falls back to the live table, which is always
 * the truthful thing to show.
 */
const TABLE_STATE_VERSION = 2

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isTeamSize(v: unknown): v is 2 | 3 {
  return v === 2 || v === 3
}

function readJSON(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private mode). The screen still works; it
    // just won't survive a tab switch this time.
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// SessionSetup: the in-progress pick, the 2v2/3v3 choice, and which game.
//
// No session exists yet at this screen, so there is nothing to key this on —
// one slot, shared by whoever is setting up the next game on this phone.
// ---------------------------------------------------------------------------

/**
 * `sport` and `target` are optional because a phone that set up a game
 * before there was a second sport stored neither, and that pick is still a
 * perfectly good beer die pick.
 */
export type StoredSetupState = { picked: string[]; size: 2 | 3; sport?: Sport; target?: number }

export function isStoredSetupState(v: unknown): v is StoredSetupState {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (!isStringArray(o.picked) || !isTeamSize(o.size)) return false
  if (o.sport === undefined) return o.target === undefined
  return isSport(o.sport) && (o.target === undefined || isValidTarget(o.sport, o.target))
}

/**
 * One saved pick per sport, since each sport's Table tab has its own setup
 * screen now. Beer die keeps the original key, so a pick saved before the
 * split still comes back.
 */
function setupKey(sport: Sport): string {
  return sport === 'beer_die' ? SETUP_KEY : `${SETUP_KEY}:${sport}`
}

export function loadSetupState(sport: Sport): StoredSetupState | null {
  const parsed = readJSON(setupKey(sport))
  if (!isStoredSetupState(parsed)) return null
  // A pick that names a different sport is not this sport's pick.
  return (parsed.sport ?? 'beer_die') === sport ? parsed : null
}

export function saveSetupState(sport: Sport, state: StoredSetupState): void {
  writeJSON(setupKey(sport), { ...state, sport })
}

export function clearSetupState(sport: Sport): void {
  remove(setupKey(sport))
}

// ---------------------------------------------------------------------------
// TableMode: the current phase (which screen, who won) and the challengers
// picked so far while on the "next up" screen.
//
// Keyed by session id, because this state belongs to a specific night. A key
// for a session other than the one live on screen is never read — restoring
// always asks for the *current* sessionId, so a stale key from an old,
// already-ended session is simply never looked at again.
// ---------------------------------------------------------------------------

export type StoredPhase =
  | { step: 'winner' }
  | { step: 'score'; winner: 'holders' | 'challengers' }
  | { step: 'challengers'; winner: 'holders' | 'challengers'; loserScore: number }
  | { step: 'teams' }

// `seq` fingerprints the server table this phase was written against
// (`Table.seq`, i.e. how many games have been played on this session so
// far). A restored phase describes a specific table — "next 3 up" over a
// specific losing score belongs to the game that produced it — and once
// another phone logs a game the table has moved on from under it. Comparing
// `seq` on restore is what lets a stale phase be told apart from a live one;
// without it, restoring by session id alone would happily replay a picker
// screen over a table that no longer exists, and "Log it" would commit a
// result for a game that was never played.
export type StoredTableState = {
  /** Always `TABLE_STATE_VERSION`; anything else is rejected outright. */
  v: number
  phase: StoredPhase
  /** The challengers tapped so far on the "next N up" screen. */
  picked: string[]
  /** The "Change teams" board mid-edit, or null when that screen is not open. */
  lineup: StoredLineup | null
  seq: number
}

/** What callers hand `saveTableState`; the version stamp is not theirs to set. */
export type StoredTableStateInput = Omit<StoredTableState, 'v'>

function isWinnerSide(v: unknown): v is 'holders' | 'challengers' {
  return v === 'holders' || v === 'challengers'
}

export function isStoredPhase(v: unknown): v is StoredPhase {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  switch (o.step) {
    case 'winner':
    case 'teams':
      return true
    case 'score':
      return isWinnerSide(o.winner)
    case 'challengers':
      return isWinnerSide(o.winner) && typeof o.loserScore === 'number' && Number.isFinite(o.loserScore)
    default:
      return false
  }
}

export function isStoredTableState(v: unknown): v is StoredTableState {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  // Version first, and strictly: a value written by an older build is not a
  // weaker version of this shape, it is a different one. Bailing here is
  // what keeps a v1 `picked` lineup from being read as anything at all.
  if (o.v !== TABLE_STATE_VERSION) return false
  if (!(o.lineup === null || isStoredLineup(o.lineup))) return false
  return isStoredPhase(o.phase) && isStringArray(o.picked) && typeof o.seq === 'number' && Number.isFinite(o.seq)
}

function tableKey(sessionId: string): string {
  return TABLE_KEY_PREFIX + sessionId
}

export function loadTableState(sessionId: string): StoredTableState | null {
  const parsed = readJSON(tableKey(sessionId))
  return isStoredTableState(parsed) ? parsed : null
}

export function saveTableState(sessionId: string, state: StoredTableStateInput): void {
  writeJSON(tableKey(sessionId), { ...state, v: TABLE_STATE_VERSION })
}

export function clearTableState(sessionId: string): void {
  remove(tableKey(sessionId))
}

// ---------------------------------------------------------------------------
// TableMode: what the next game is being played to, when the night's sport
// lets the table choose. Kept apart from the phase above because that state
// is cleared whenever the screen settles back on "who won?", and the target
// has to outlive that. Like everything here it's a convenience: the game
// itself carries its target to the server, which is the record.
// ---------------------------------------------------------------------------

function targetKey(sessionId: string): string {
  return TARGET_KEY_PREFIX + sessionId
}

export function loadTarget(sessionId: string, sport: Sport): number | null {
  const parsed = readJSON(targetKey(sessionId))
  return isValidTarget(sport, parsed) ? parsed : null
}

export function saveTarget(sessionId: string, target: number): void {
  writeJSON(targetKey(sessionId), target)
}

export function clearTarget(sessionId: string): void {
  remove(targetKey(sessionId))
}

/**
 * Whether stored table state is still safe to restore over the table now at
 * `currentSeq`. `stored` is what a session-id-keyed lookup found (or
 * `null`); `currentSeq` is the *server's* `Table.seq` for this mount — how
 * many games have actually been played on this session so far.
 *
 * Session id alone identifies the night, not the moment: between one visit
 * to this screen and the next, another phone can log a game against the
 * very same session, moving `seq` and swapping in new holders/challengers.
 * A stored phase that no longer matches the live `seq` describes a table
 * that no longer exists — restoring it anyway would show a "next 3 up" or a
 * losing score for a game that isn't the one on the table, and logging it
 * would fabricate a result. `null` (nothing stored) is never current.
 */
export function isTableStateCurrent(
  stored: StoredTableState | null,
  currentSeq: number,
): stored is StoredTableState {
  return stored !== null && stored.seq === currentSeq
}
