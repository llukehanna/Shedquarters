/**
 * The games the Shed keeps a ladder for. Each one has its own ratings, its
 * own rankings and its own history: a beer die rating says nothing about
 * someone's spikeball, so the two are never replayed together.
 *
 * The value is what `sessions.game_type` and `games.game_type` store, so it
 * is part of the data, not just a label. Renaming one means a migration.
 */
export type Sport = 'beer_die' | 'spikeball'

export const SPORTS: readonly Sport[] = ['beer_die', 'spikeball']

export const DEFAULT_SPORT: Sport = 'beer_die'

export type TeamSize = 2 | 3

export type SportRules = {
  name: string
  /** What a game can be played to, in the order the picker shows them. */
  targets: readonly number[]
  /** Where a new night starts when nobody picks. */
  defaultTarget: number
  /** The team sizes a night can be set up with, in the order the toggle shows them. */
  teamSizes: readonly TeamSize[]
  /** What the winners hold on to: "Holding the table", "the first 2 hold the net". */
  holds: 'table' | 'net'
}

export const SPORT_RULES: Record<Sport, SportRules> = {
  beer_die: {
    name: 'Beer die',
    targets: [21],
    defaultTarget: 21,
    teamSizes: [3, 2],
    holds: 'table',
  },
  // Games to 25, 15 or 11, win by 2, and always two on two: the house picks
  // the length per game, so every game row records its own target.
  spikeball: {
    name: 'Spikeball',
    targets: [25, 15, 11],
    defaultTarget: 15,
    teamSizes: [2],
    holds: 'net',
  },
}

export function isSport(v: unknown): v is Sport {
  return v === 'beer_die' || v === 'spikeball'
}

/**
 * The sport a page's `?sport=` asks for. Anything missing or unrecognized
 * falls back to beer die rather than 404ing, so an old bookmark or a typo
 * still lands on a ladder.
 */
export function parseSport(v: string | string[] | undefined): Sport {
  const first = Array.isArray(v) ? v[0] : v
  return isSport(first) ? first : DEFAULT_SPORT
}

export function isValidTarget(sport: Sport, target: unknown): target is number {
  return typeof target === 'number' && SPORT_RULES[sport].targets.includes(target)
}

export function isValidTeamSize(sport: Sport, size: unknown): size is TeamSize {
  return (size === 2 || size === 3) && SPORT_RULES[sport].teamSizes.includes(size)
}

/**
 * `path` with `?sport=` set for anything other than the default, so beer die
 * URLs look exactly as they did before there was a second sport.
 */
export function withSport(path: string, sport: Sport): string {
  if (sport === DEFAULT_SPORT) return path
  return `${path}${path.includes('?') ? '&' : '?'}sport=${sport}`
}
