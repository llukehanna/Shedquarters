import type { Streak } from '@/lib/domain/stats'
import { SHED_TIME_ZONE } from '@/lib/domain/game-log'

/** One decimal. Values that round to zero render as "0.0", never "-0.0". */
export function formatRating(ordinal: number): string {
  const fixed = ordinal.toFixed(1)
  return fixed === '-0.0' ? '0.0' : fixed
}

export function formatRecord(wins: number, games: number): string {
  return `${wins}–${games - wins}`
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function countLabel(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** A game log night heading, e.g. "Fri, Sep 12". Pinned to `SHED_TIME_ZONE`
 *  rather than to UTC or the host's zone — see that constant for why, and
 *  for the other place that reads it. */
export function formatNightDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: SHED_TIME_ZONE,
  })
}

/** Signed whole-number differential: "+34", "-12", or "0" (never "-0"). */
export function formatDiff(total: number): string {
  const rounded = Math.round(total)
  if (rounded === 0) return '0'
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

/** Signed one-decimal average, e.g. "+1.4" / "-2.3" / "0.0" (never "-0.0"). */
export function formatDiffAverage(average: number): string {
  const fixed = average.toFixed(1)
  if (Number(fixed) === 0) return '0.0'
  return Number(fixed) > 0 ? `+${fixed}` : fixed
}

/**
 * "W2" / "L4". Callers only invoke this once they already know the player
 * has a streak (both current call sites are inside a `streak &&` guard) —
 * there is deliberately no null case here to keep dead.
 */
export function formatStreak(streak: Streak): string {
  return `${streak.result}${streak.length}`
}

/**
 * "▲2" / "▼3" for a rank change, "—" for no change. Callers only invoke
 * this once they already know the player has a movement value (both
 * current call sites are inside a `movement !== null` guard) — a player
 * absent from the old standings renders nothing, handled by the caller
 * before this is ever called.
 */
export function formatMovement(delta: number): string {
  if (delta === 0) return '—'
  return delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`
}

/** Screen-reader text alternative for the movement glyph, e.g. "Up 2 this week." */
export function formatMovementLabel(delta: number): string {
  if (delta === 0) return 'No change this week'
  return delta > 0 ? `Up ${delta} this week` : `Down ${Math.abs(delta)} this week`
}
