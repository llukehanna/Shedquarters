import { sql } from '@/lib/db'
import { computeRatingsAndDeltas, type PlayerRating, type GameDelta } from '@/lib/domain/ratings'
import { getGames, getFingerprint } from '@/lib/queries'

const deltasToJson = (deltas: Map<number, GameDelta>): Record<string, GameDelta> => {
  const out: Record<string, GameDelta> = {}
  for (const [ord, d] of deltas) out[ord] = d
  return out
}

const deltasFromJson = (json: Record<string, GameDelta>): Map<number, GameDelta> =>
  new Map(Object.entries(json).map(([ord, d]) => [Number(ord), d]))

async function writeCache(
  fingerprint: string,
  ratings: PlayerRating[],
  deltas: Map<number, GameDelta>,
): Promise<void> {
  await sql`
    insert into ratings_cache (id, fingerprint, payload, deltas, computed_at)
    values (1, ${fingerprint}, ${sql.json(ratings)}, ${sql.json(deltasToJson(deltas))}, now())
    on conflict (id) do update
      set fingerprint = excluded.fingerprint,
          payload     = excluded.payload,
          deltas      = excluded.deltas,
          computed_at = excluded.computed_at
  `
}

/**
 * One replay from one `getGames()` snapshot, used on any cache miss by both
 * `getRatings` and `getRatingDeltas`. Always recomputes ratings fresh here
 * rather than ever pairing a freshly replayed `deltas` with an older cached
 * `payload` (or vice versa) — those two could come from different snapshots
 * of `games` (e.g. a game landing between this call's `getFingerprint()` and
 * `getGames()`), and mismatched ratings/deltas is worse than the extra
 * replay. The write primes the row for whichever of the two functions
 * didn't just call this.
 */
async function computeAndCache(
  fingerprint: string,
): Promise<{ ratings: PlayerRating[]; deltas: Map<number, GameDelta> }> {
  const { ratings, deltas } = computeRatingsAndDeltas(await getGames())
  const sorted = [...ratings.values()].sort((a, b) => b.ordinal - a.ordinal)
  await writeCache(fingerprint, sorted, deltas)
  return { ratings: sorted, deltas }
}

export async function getRatings(): Promise<PlayerRating[]> {
  const fingerprint = await getFingerprint()

  // Selects only `payload` — never `deltas` — so the hottest pages (the
  // rankings and player-profile pages, which only ever want ratings) don't
  // pay to fetch and JSON-parse a blob of every live game's delta just to
  // throw it away.
  const [cached] = await sql`
    select fingerprint, payload from ratings_cache where id = 1
  `
  if (cached && cached.fingerprint === fingerprint) {
    return cached.payload as PlayerRating[]
  }

  return (await computeAndCache(fingerprint)).ratings
}

/**
 * Per-game rating deltas for the whole history. On a cache hit this is the
 * only thing selected or deserialized — `getRatings` above never touches
 * this column. On a miss it replays once via `computeAndCache`, which also
 * (re)writes `payload`, so `getRatings` doesn't have to replay again next
 * time either. A voided game has no entry.
 */
export async function getRatingDeltas(): Promise<Map<number, GameDelta>> {
  const fingerprint = await getFingerprint()

  const [cached] = await sql`
    select fingerprint, deltas from ratings_cache where id = 1
  `
  // A fingerprint match with a null `deltas` column is a row written before
  // this column existed (see lib/schema.sql) — a cache miss for deltas
  // specifically, not a crash and not a reason to trust a stale shape.
  if (cached && cached.fingerprint === fingerprint && cached.deltas) {
    return deltasFromJson(cached.deltas as Record<string, GameDelta>)
  }

  return (await computeAndCache(fingerprint)).deltas
}
