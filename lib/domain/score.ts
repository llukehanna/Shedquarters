/** Beer die's target, and the default for any game that doesn't say otherwise. */
export const TARGET_SCORE = 21
export const WIN_BY = 2

/** The highest losing score still reachable by a plain win to `target` (19 for 21). */
export function deuceLine(target: number = TARGET_SCORE): number {
  return target - WIN_BY
}

export function isValidLoserScore(n: number): boolean {
  return Number.isInteger(n) && n >= 0
}

/**
 * The winning score is a pure function of the losing score and the target.
 * At or below the deuce line the winner reached the target exactly;
 * above it the game went to deuce and ended the moment the winner
 * was two clear. Every sport the Shed plays is win by 2.
 */
export function winnerScore(loserScore: number, target: number = TARGET_SCORE): number {
  if (!isValidLoserScore(loserScore)) {
    throw new Error(`invalid losing score: ${loserScore}`)
  }
  return loserScore <= deuceLine(target) ? target : loserScore + WIN_BY
}

/**
 * Win margin at or above which the table stops being polite about it.
 *
 * Eleven, so that the rule is exactly "the losing team never reached half of
 * what they needed": half of a 21-point target is 10.5, and a margin of 11
 * means the loser finished on 10 or fewer. (Ten would put the loser on 11,
 * which is past halfway — the earlier number and this reasoning disagreed by
 * one point, and the reasoning is the part worth keeping, so the number
 * moved.) A 21-11 is a game somebody lost; a 21-10 is a game they were never
 * in.
 *
 * A deuce win is always exactly `WIN_BY` clear, so a game that went past 21
 * can never qualify no matter how long it ran.
 */
export const LOSERS_TAX_MARGIN = 11

/**
 * The same rule for any target: the smallest margin that means the losers
 * finished below half of it. 11 for 21, 6 for 11, 8 for 15, 13 for 25.
 */
export function losersTaxMargin(target: number = TARGET_SCORE): number {
  return Math.floor(target / 2) + 1
}

/**
 * The callout itself, verbatim. One line, and it names a consequence without
 * inventing the rule it will be settled under — that is the Shed's to make
 * up on the night, not this file's to presume.
 */
export const LOSERS_TAX_LINE = "Loser's tax."

/**
 * The line to show under a just-entered final, or null when the game was
 * close enough to leave alone. Display-only: nothing here is persisted, and
 * nothing here touches ratings — `lib/domain/ratings.ts` has its own
 * `MARGIN`, which is about how much a scoreline moves a rating and is
 * deliberately not reused for what the table says out loud.
 */
export function losersTax(loserScore: number, target: number = TARGET_SCORE): string | null {
  return winnerScore(loserScore, target) - loserScore >= losersTaxMargin(target) ? LOSERS_TAX_LINE : null
}
