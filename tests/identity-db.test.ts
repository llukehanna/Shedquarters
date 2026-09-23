import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { assertLocalDatabase } from '@/lib/db-guard'
import { sql } from '@/lib/db'
import { bumpInviteVersion, claimPlayer, getClaimedPlayerIds, getInviteVersion } from '@/lib/identity'

// This file hard-deletes claims and rewrites house_settings. Refuse to load at
// all unless the database is local.
assertLocalDatabase()

async function makePlayer(name: string): Promise<string> {
  const [row] = await sql`
    insert into players (display_name) values (${name})
    on conflict (display_name) do update set display_name = excluded.display_name
    returning id
  `
  return row.id as string
}

beforeEach(async () => {
  await sql`delete from player_claims`
  await sql`update house_settings set invite_version = 1 where id = 1`
})

afterAll(async () => {
  await sql`delete from player_claims`
  await sql`delete from players where display_name like 'IdentityTest %'`
  // Upsert rather than update: the missing-row test below deletes this row,
  // and it may not exist by the time this runs, so restore it either way.
  await sql`
    insert into house_settings (id, invite_version) values (1, 1)
    on conflict (id) do update set invite_version = 1
  `
})

describe('identity', () => {
  it('starts at invite version 1', async () => {
    expect(await getInviteVersion()).toBe(1)
  })

  it('bumps the invite version and returns the new one', async () => {
    expect(await bumpInviteVersion()).toBe(2)
    expect(await getInviteVersion()).toBe(2)
  })

  it('self-heals when the house_settings row is missing, like getInviteVersion does', async () => {
    await sql`delete from house_settings where id = 1`
    const bumped = await bumpInviteVersion()
    expect(typeof bumped).toBe('number')
    expect(await getInviteVersion()).toBe(bumped)
  })

  it('claims a player once and lists them', async () => {
    const id = await makePlayer('IdentityTest Luke')
    await claimPlayer(id)
    expect(await getClaimedPlayerIds()).toEqual([id])
  })

  it('reclaiming from another phone keeps one row and moves claimed_at', async () => {
    const id = await makePlayer('IdentityTest Luke')
    await claimPlayer(id)
    const [first] = await sql`select claimed_at from player_claims where player_id = ${id}`
    await claimPlayer(id)
    const rows = await sql`select claimed_at from player_claims where player_id = ${id}`
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0].claimed_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.claimed_at).getTime(),
    )
  })

  it('drops the claim when the player is deleted', async () => {
    const id = await makePlayer('IdentityTest Guest')
    await claimPlayer(id)
    await sql`delete from players where id = ${id}`
    expect(await getClaimedPlayerIds()).toEqual([])
  })
})
