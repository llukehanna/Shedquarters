import { describe, it, expect } from 'vitest'
import {
  winnerScore,
  isValidLoserScore,
  TARGET_SCORE,
  losersTax,
  LOSERS_TAX_LINE,
  LOSERS_TAX_MARGIN,
  losersTaxMargin,
  deuceLine,
} from '@/lib/domain/score'

describe('winnerScore', () => {
  it('is the target when the loser is below the deuce line', () => {
    expect(winnerScore(0)).toBe(21)
    expect(winnerScore(14)).toBe(21)
    expect(winnerScore(19)).toBe(21)
  })

  it('is loser + 2 once the loser reaches 20', () => {
    expect(winnerScore(20)).toBe(22)
    expect(winnerScore(21)).toBe(23)
    expect(winnerScore(30)).toBe(32)
  })

  it('never produces a one-point win', () => {
    for (let loser = 0; loser <= 40; loser++) {
      expect(winnerScore(loser) - loser).toBeGreaterThanOrEqual(2)
    }
  })

  it('rejects impossible losing scores', () => {
    expect(() => winnerScore(-1)).toThrow()
    expect(() => winnerScore(1.5)).toThrow()
  })
})

describe('isValidLoserScore', () => {
  it('accepts non-negative integers only', () => {
    expect(isValidLoserScore(0)).toBe(true)
    expect(isValidLoserScore(19)).toBe(true)
    expect(isValidLoserScore(-1)).toBe(false)
    expect(isValidLoserScore(2.5)).toBe(false)
  })
})

describe('losersTax', () => {
  it('fires on the exact margin and not a point under it', () => {
    const onTheLine = TARGET_SCORE - LOSERS_TAX_MARGIN // margin is exactly LOSERS_TAX_MARGIN
    expect(winnerScore(onTheLine) - onTheLine).toBe(LOSERS_TAX_MARGIN)
    expect(losersTax(onTheLine)).toBe(LOSERS_TAX_LINE)
    expect(losersTax(onTheLine + 1)).toBeNull()
  })

  it('fires on a shutout, the widest margin there is', () => {
    expect(losersTax(0)).toBe(LOSERS_TAX_LINE)
  })

  it('stays quiet on every ordinary game', () => {
    for (let loser = TARGET_SCORE - LOSERS_TAX_MARGIN + 1; loser <= 19; loser++) {
      expect(losersTax(loser), `21–${loser}`).toBeNull()
    }
  })

  it('fires on every genuine blowout', () => {
    for (let loser = 0; loser <= TARGET_SCORE - LOSERS_TAX_MARGIN; loser++) {
      expect(losersTax(loser), `21–${loser}`).toBe(LOSERS_TAX_LINE)
    }
  })

  it('never fires on a deuce game, however long it ran', () => {
    for (let loser = 20; loser <= 60; loser++) {
      expect(losersTax(loser), `deuce at ${loser}`).toBeNull()
    }
  })

  it('rejects an impossible losing score rather than quietly taxing it', () => {
    expect(() => losersTax(-1)).toThrow()
    expect(() => losersTax(3.5)).toThrow()
  })

  it('is one dry line, not a paragraph', () => {
    expect(LOSERS_TAX_LINE.split('\n')).toHaveLength(1)
    expect(LOSERS_TAX_LINE.length).toBeLessThan(80)
  })

  it('is the agreed line, verbatim', () => {
    expect(LOSERS_TAX_LINE).toBe("Loser's tax.")
  })
})

describe('constants', () => {
  it('targets 21', () => {
    expect(TARGET_SCORE).toBe(21)
  })

  it("draws the loser's tax exactly where the losing team failed to reach half the target", () => {
    // The rule the comment in score.ts claims, asserted rather than trusted:
    // the worst score that escapes the tax is above half of 21, and the best
    // score that attracts it is below. A margin of 10 would put the best
    // taxed score at 11, which is past halfway — this fails if it goes back.
    const bestTaxed = TARGET_SCORE - LOSERS_TAX_MARGIN
    const worstUntaxed = bestTaxed + 1

    expect(bestTaxed).toBeLessThan(TARGET_SCORE / 2)
    expect(worstUntaxed).toBeGreaterThan(TARGET_SCORE / 2)
    expect(losersTax(bestTaxed)).toBe(LOSERS_TAX_LINE)
    expect(losersTax(worstUntaxed)).toBeNull()
    expect(LOSERS_TAX_MARGIN).toBe(11)
  })
})

describe('other targets (spikeball)', () => {
  it('gives the winner the target up to the deuce line', () => {
    expect(winnerScore(0, 11)).toBe(11)
    expect(winnerScore(9, 11)).toBe(11)
    expect(winnerScore(13, 15)).toBe(15)
    expect(winnerScore(23, 25)).toBe(25)
  })

  it('goes to win by 2 past the deuce line', () => {
    expect(deuceLine(11)).toBe(9)
    expect(winnerScore(10, 11)).toBe(12)
    expect(winnerScore(14, 15)).toBe(16)
    expect(winnerScore(24, 25)).toBe(26)
    expect(winnerScore(30, 25)).toBe(32)
  })

  it('keeps 21 as the default so beer die callers are unchanged', () => {
    expect(deuceLine()).toBe(19)
    expect(winnerScore(19)).toBe(winnerScore(19, 21))
  })

  it('scales the loser’s tax to "never reached half the target"', () => {
    expect(losersTaxMargin(21)).toBe(LOSERS_TAX_MARGIN)
    expect(losersTaxMargin(11)).toBe(6)
    expect(losersTaxMargin(15)).toBe(8)
    expect(losersTaxMargin(25)).toBe(13)
    for (const target of [11, 15, 21, 25]) {
      for (let loser = 0; loser <= deuceLine(target); loser++) {
        const taxed = losersTax(loser, target) !== null
        expect(taxed, `${target}–${loser}`).toBe(loser < target / 2)
      }
    }
  })

  it('never taxes a deuce game', () => {
    expect(losersTax(10, 11)).toBeNull()
    expect(losersTax(24, 25)).toBeNull()
  })
})
