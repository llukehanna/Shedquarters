import type { LogGameInput } from '@/lib/types'

export type Table = {
  holders: string[]
  challengers: string[]
  runLength: number
  seq: number
}

export function applyGame(
  t: Table,
  winner: 'holders' | 'challengers',
  nextChallengers: string[],
): Table {
  const holdersWon = winner === 'holders'
  return {
    holders: holdersWon ? t.holders : t.challengers,
    challengers: nextChallengers,
    runLength: holdersWon ? t.runLength + 1 : 1,
    seq: t.seq + 1,
  }
}

export function applyPending(base: Table, pending: LogGameInput[]): Table {
  return pending.reduce((t, m) => applyGame(t, m.winner, m.nextChallengers), base)
}
