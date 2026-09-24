'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePasscode, setClaim } from '@/lib/auth'
import * as identity from '@/lib/identity'
import * as queries from '@/lib/queries'
import * as session from '@/lib/session'
import type { LogGameInput } from '@/lib/types'

/**
 * The gate every action below calls first.
 *
 * `requirePasscode()` throws `unauthorized` for a phone whose session is
 * missing, forged, expired, or issued under an invite version Shedquarters has
 * reset past — which is every phone the moment the PIN changes or the invite is
 * reset. Left to throw, that surfaced as a 500 and a minified React error in
 * whatever panel the person was looking at. Redirecting sends them to the gate
 * instead, where they can get back in. Callers that catch action errors must
 * re-throw the redirect with `unstable_rethrow` from next/navigation.
 *
 * Only `unauthorized` redirects. A missing AUTH_SECRET or a database that will
 * not answer is a server fault, not a signed-out phone: sending those to the
 * gate would tell someone to re-enter a PIN that cannot fix anything, and hide
 * the real failure from the error screen that exists to show it.
 */
async function gate(): Promise<void> {
  try {
    await requirePasscode()
  } catch (err) {
    if (err instanceof Error && err.message === 'unauthorized') redirect('/gate')
    throw err
  }
}

export async function startSession(
  holders: string[],
  challengers: string[],
  opts: session.StartOptions = {},
): Promise<string> {
  await gate()
  const id = await session.startSession(holders, challengers, opts)
  revalidatePath('/table')
  return id
}

export async function logGame(input: LogGameInput): Promise<void> {
  await gate()
  await session.logGame(input)
  revalidatePath('/table')
  revalidatePath('/')
}

export async function setTeams(
  sessionId: string,
  holders: string[],
  challengers: string[],
  teamSize: 2 | 3,
): Promise<void> {
  await gate()
  await session.setTeams(sessionId, holders, challengers, teamSize)
  revalidatePath('/table')
}

export async function voidLastGame(sessionId: string): Promise<void> {
  await gate()
  await session.voidLastGame(sessionId)
  revalidatePath('/table')
  revalidatePath('/')
}

export async function endSession(sessionId: string): Promise<void> {
  await gate()
  await session.endSession(sessionId)
  revalidatePath('/table')
}

export async function addPlayer(name: string, isHousemate: boolean): Promise<boolean> {
  await gate()
  const added = await session.addPlayer(name, isHousemate)
  revalidatePath('/roster')
  revalidatePath('/table')
  return added
}

export async function claimPlayer(playerId: string): Promise<void> {
  await gate()
  await identity.claimPlayer(playerId)
  await setClaim(playerId)
  revalidatePath('/roster')
}

/** Adds a guest and claims them for this phone. False when the name is taken. */
export async function addAndClaimGuest(name: string): Promise<boolean> {
  await gate()
  const added = await session.addPlayer(name, false)
  if (!added) return false
  const player = (await queries.getPlayers()).find((p) => p.displayName === name.trim())
  if (!player) return false
  await identity.claimPlayer(player.id)
  await setClaim(player.id)
  revalidatePath('/roster')
  return true
}

/** Renames a player. False when another player already holds that name. */
export async function renamePlayer(id: string, name: string): Promise<boolean> {
  await gate()
  const renamed = await session.renamePlayer(id, name)
  if (renamed) {
    revalidatePath('/')
    revalidatePath('/roster')
    revalidatePath('/table')
    revalidatePath(`/players/${id}`)
  }
  return renamed
}

/** Adds a nickname to a player's list. False on a duplicate or at the cap. */
export async function addNickname(id: string, nickname: string): Promise<boolean> {
  await gate()
  const added = await session.addNickname(id, nickname)
  if (added) {
    revalidatePath('/roster')
    revalidatePath(`/players/${id}`)
  }
  return added
}

/** Removes one of a player's nicknames by exact match. */
export async function removeNickname(id: string, nickname: string): Promise<void> {
  await gate()
  await session.removeNickname(id, nickname)
  revalidatePath('/roster')
  revalidatePath(`/players/${id}`)
}
