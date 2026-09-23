export const TARGET_SCORE = 21
export const WIN_BY = 2

/** The highest losing score still reachable by a plain win to the target. */
const DEUCE_LINE = TARGET_SCORE - WIN_BY // 19

export function isValidLoserScore(n: number): boolean {
  return Number.isInteger(n) && n >= 0
}

/**
 * The winning score is a pure function of the losing score.
 * At or below the deuce line the winner reached the target exactly;
 * above it the game went to deuce and ended the moment the winner
 * was two clear.
 */
export function winnerScore(loserScore: number): number {
  if (!isValidLoserScore(loserScore)) {
    throw new Error(`invalid losing score: ${loserScore}`)
  }
  return loserScore <= DEUCE_LINE ? TARGET_SCORE : loserScore + WIN_BY
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
export function losersTax(loserScore: number): string | null {
  return winnerScore(loserScore) - loserScore >= LOSERS_TAX_MARGIN ? LOSERS_TAX_LINE : null
}
