import { sql } from '@/lib/db'

/**
 * The night tests open nights of their own, and the database allows one open
 * night per sport. A night left open in the local database (from playing with
 * the app on `npm run dev`) would make them fail in a way that looks like a bug,
 * so say what is actually wrong instead.
 */
export async function assertNoOpenNights(): Promise<void> {
  const open = await sql`select game_type, count(*)::int as n from sessions where ended_at is null group by 1`
  if (open.length > 0) {
    const which = open.map((r) => `${r.n} ${r.game_type}`).join(', ')
    throw new Error(
      `The local database has open nights (${which}). The night tests need none open: ` +
        'end them in the app, or `update sessions set ended_at = now() where ended_at is null`.',
    )
  }
}
