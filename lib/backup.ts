import { sql } from '@/lib/db'

export type BackupDump = {
  takenAt: string
  players: unknown[]
  sessions: unknown[]
  games: unknown[]
}

/**
 * Assembles the nightly backup payload from the three source-of-truth
 * tables. Deliberately excludes ratings_cache: it is derived from `games`,
 * and a replay rebuilds it, so it would only bloat the dump.
 *
 * Split out from the cron route so the assembly (querying + shaping JSON)
 * can be exercised against a real local database without needing
 * BLOB_READ_WRITE_TOKEN, which only exists once the project is linked to
 * Vercel Blob.
 */
export async function assembleDump(): Promise<BackupDump> {
  const [players, sessions, games] = await Promise.all([
    sql`select * from players order by created_at`,
    sql`select * from sessions order by started_at`,
    sql`select * from games order by ord`,
  ])

  return {
    takenAt: new Date().toISOString(),
    players,
    sessions,
    games,
  }
}
