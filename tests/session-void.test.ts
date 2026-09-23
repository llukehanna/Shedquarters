import { beforeEach, describe, expect, it, vi } from 'vitest'

// voidLastGame mirrors logGame in the opposite direction, and must hold the
// same invariant logGame's own sql.begin was added for: the games table and
// the session's holders/challengers can never be left disagreeing. If the void
// commits but the restore does not, the session still names the post-game
// holders and the next logGame writes team_a = the wrong roster — silently
// corrupting the column that voidLastGame and longestRuns() both read back.
//
// The observable contract is "both statements go through one transaction", so
// that is what is asserted here: a recording `sql` stub distinguishes
// statements issued at the top level from statements issued on a transaction
// handle inside sql.begin(). No database needed.
const h = vi.hoisted(() => {
  const calls: { text: string; via: 'sql' | 'tx' }[] = []
  let selectRows: Record<string, unknown>[] = []

  function tag(via: 'sql' | 'tx') {
    return (strings: TemplateStringsArray) => {
      const text = strings.join(' ? ').replace(/\s+/g, ' ').trim()
      calls.push({ text, via })
      return Promise.resolve(/^select/i.test(text) ? selectRows : [])
    }
  }

  const sql = Object.assign(tag('sql'), {
    begin: async (fn: (tx: ReturnType<typeof tag>) => Promise<void>) => {
      calls.push({ text: 'BEGIN', via: 'sql' })
      await fn(tag('tx'))
      calls.push({ text: 'COMMIT', via: 'sql' })
    },
  })

  return {
    sql,
    calls,
    reset(rows: Record<string, unknown>[]) {
      calls.length = 0
      selectRows = rows
    },
  }
})

vi.mock('@/lib/db', () => ({ sql: h.sql }))

import { voidLastGame } from '@/lib/session'

const game = {
  id: 'g1',
  team_a: ['a1', 'a2', 'a3'],
  team_b: ['b1', 'b2', 'b3'],
}

beforeEach(() => {
  h.reset([game])
})

describe('voidLastGame', () => {
  it('voids the game and restores the table inside one transaction', async () => {
    await voidLastGame('s1')

    const order = h.calls.map((c) => `${c.via}:${c.text.split(' ').slice(0, 4).join(' ')}`)
    expect(order).toEqual([
      'sql:select id, team_a, team_b',
      'sql:BEGIN',
      'tx:update games set voided',
      'tx:update sessions set holders',
      'sql:COMMIT',
    ])
  })

  it('issues neither write outside the transaction', async () => {
    await voidLastGame('s1')

    const writesOutsideTx = h.calls.filter((c) => c.via === 'sql' && /^update/i.test(c.text))
    expect(writesOutsideTx).toEqual([])
  })

  it('writes nothing at all when the session has no un-voided game', async () => {
    h.reset([])

    await voidLastGame('s1')

    expect(h.calls.map((c) => c.text)).toEqual([
      'select id, team_a, team_b from games where session_id = ? and voided = false order by seq desc limit 1',
    ])
  })
})
