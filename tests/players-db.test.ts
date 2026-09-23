import { afterAll, describe, expect, it } from 'vitest'
import { assertLocalDatabase } from '@/lib/db-guard'
import { sql } from '@/lib/db'
import { renamePlayer, addNickname, removeNickname } from '@/lib/session'

// This file renames real player rows and adds/removes their nicknames.
// Refuse to load at all unless the database is local.
assertLocalDatabase()

async function makePlayer(name: string): Promise<string> {
  const [row] = await sql`
    insert into players (display_name) values (${name})
    on conflict (display_name) do update set display_name = excluded.display_name
    returning id
  `
  return row.id as string
}

async function nicknamesOf(id: string): Promise<string[]> {
  const [row] = await sql`select nicknames from players where id = ${id}`
  return row.nicknames as string[]
}

afterAll(async () => {
  await sql`delete from players where display_name like 'PlayersTest %'`
})

describe('renamePlayer', () => {
  it('changes the name', async () => {
    const id = await makePlayer('PlayersTest Alpha')
    const ok = await renamePlayer(id, 'PlayersTest Alpha Renamed')
    expect(ok).toBe(true)
    const [row] = await sql`select display_name from players where id = ${id}`
    expect(row.display_name).toBe('PlayersTest Alpha Renamed')
  })

  it('returns false and changes nothing when another player already holds that name', async () => {
    const id = await makePlayer('PlayersTest Bravo')
    await makePlayer('PlayersTest Charlie')
    const ok = await renamePlayer(id, 'PlayersTest Charlie')
    expect(ok).toBe(false)
    const [row] = await sql`select display_name from players where id = ${id}`
    expect(row.display_name).toBe('PlayersTest Bravo')
  })

  it('renaming to the player’s own current name succeeds', async () => {
    const id = await makePlayer('PlayersTest Delta')
    const ok = await renamePlayer(id, 'PlayersTest Delta')
    expect(ok).toBe(true)
    const [row] = await sql`select display_name from players where id = ${id}`
    expect(row.display_name).toBe('PlayersTest Delta')
  })

  it('throws on an empty name', async () => {
    const id = await makePlayer('PlayersTest Echo')
    await expect(renamePlayer(id, '')).rejects.toThrow()
  })

  it('throws on a whitespace-only name', async () => {
    const id = await makePlayer('PlayersTest Foxtrot')
    await expect(renamePlayer(id, '   ')).rejects.toThrow()
  })

  it('rejects a name over 40 characters', async () => {
    const id = await makePlayer('PlayersTest Golf')
    const tooLong = 'PlayersTest ' + 'x'.repeat(30) // > 40 chars total
    await expect(renamePlayer(id, tooLong)).rejects.toThrow()
    const [row] = await sql`select display_name from players where id = ${id}`
    expect(row.display_name).toBe('PlayersTest Golf')
  })
})

describe('addNickname', () => {
  it('gives the player that nickname', async () => {
    const id = await makePlayer('PlayersTest Hotel')
    const ok = await addNickname(id, 'Hots')
    expect(ok).toBe(true)
    expect(await nicknamesOf(id)).toEqual(['Hots'])
  })

  it('adding a second keeps both, in a stable order', async () => {
    const id = await makePlayer('PlayersTest India')
    await addNickname(id, 'Indy')
    await addNickname(id, 'Indiana')
    expect(await nicknamesOf(id)).toEqual(['Indy', 'Indiana'])
  })

  it('adding a duplicate returns false and does not add a second copy', async () => {
    const id = await makePlayer('PlayersTest Juliet')
    await addNickname(id, 'Jules')
    const ok = await addNickname(id, 'Jules')
    expect(ok).toBe(false)
    expect(await nicknamesOf(id)).toEqual(['Jules'])
  })

  it('a different-case duplicate also returns false and adds nothing', async () => {
    const id = await makePlayer('PlayersTest Kilo')
    await addNickname(id, 'Killer')
    const ok = await addNickname(id, 'KILLER')
    expect(ok).toBe(false)
    expect(await nicknamesOf(id)).toEqual(['Killer'])
  })

  it('adding past the cap returns false and leaves the existing six alone', async () => {
    const id = await makePlayer('PlayersTest Lima')
    const six = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']
    for (const n of six) {
      expect(await addNickname(id, n)).toBe(true)
    }
    const ok = await addNickname(id, 'N7')
    expect(ok).toBe(false)
    expect(await nicknamesOf(id)).toEqual(six)
  })

  it('throws on an empty nickname', async () => {
    const id = await makePlayer('PlayersTest Mike')
    await expect(addNickname(id, '')).rejects.toThrow()
  })

  it('throws on a whitespace-only nickname', async () => {
    const id = await makePlayer('PlayersTest November')
    await expect(addNickname(id, '   ')).rejects.toThrow()
  })

  it('rejects a nickname over 40 characters', async () => {
    const id = await makePlayer('PlayersTest Oscar')
    await expect(addNickname(id, 'x'.repeat(41))).rejects.toThrow()
    expect(await nicknamesOf(id)).toEqual([])
  })

  it('two different players can hold the same nickname', async () => {
    const a = await makePlayer('PlayersTest Papa1')
    const b = await makePlayer('PlayersTest Papa2')
    await addNickname(a, 'Big Cat')
    await addNickname(b, 'Big Cat')
    expect(await nicknamesOf(a)).toEqual(['Big Cat'])
    expect(await nicknamesOf(b)).toEqual(['Big Cat'])
  })

  it('a player with no nicknames reads back as an empty array, never null', async () => {
    const id = await makePlayer('PlayersTest Quebec')
    expect(await nicknamesOf(id)).toEqual([])
  })
})

describe('removeNickname', () => {
  it('takes out only that one', async () => {
    const id = await makePlayer('PlayersTest Romeo')
    await addNickname(id, 'Rom')
    await addNickname(id, 'Romy')
    await removeNickname(id, 'Rom')
    expect(await nicknamesOf(id)).toEqual(['Romy'])
  })

  it('removing one the player does not have is a no-op', async () => {
    const id = await makePlayer('PlayersTest Sierra')
    await addNickname(id, 'Si')
    await removeNickname(id, 'Nope')
    expect(await nicknamesOf(id)).toEqual(['Si'])
  })
})
