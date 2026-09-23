import { sql } from '@/lib/db'

/**
 * The house's identity data: who has claimed which player, and which invite
 * version is current. No auth here — `lib/actions.ts` gates every writer, the
 * same split `lib/session.ts` follows.
 *
 * The invite token itself is never stored. It is derived from AUTH_SECRET and
 * the version (lib/domain/invite.ts), so bumping the version below is what
 * revokes a leaked link.
 */

export async function getInviteVersion(): Promise<number> {
  const [row] = await sql`select invite_version from house_settings where id = 1`
  // The migration seeds the row; a database restored without it still works.
  if (!row) {
    await sql`insert into house_settings (id, invite_version) values (1, 1) on conflict (id) do nothing`
    return 1
  }
  return Number(row.invite_version)
}

export async function bumpInviteVersion(): Promise<number> {
  // Single atomic upsert: if the seed row is missing, insert it already at
  // version 2 (one past the default of 1); otherwise increment in place.
  // Postgres serializes conflicting upserts against the same primary key, so
  // concurrent callers can never both observe a missing row and both insert
  // — one wins the insert and the other's statement then increments it —
  // meaning two concurrent bumps can never produce the same "new" version.
  const [row] = await sql`
    insert into house_settings (id, invite_version) values (1, 2)
    on conflict (id) do update set invite_version = house_settings.invite_version + 1
    returning invite_version
  `
  return Number(row.invite_version)
}

export async function claimPlayer(playerId: string): Promise<void> {
  await sql`
    insert into player_claims (player_id, claimed_at) values (${playerId}, now())
    on conflict (player_id) do update set claimed_at = now()
  `
}

export async function getClaimedPlayerIds(): Promise<string[]> {
  const rows = await sql`select player_id from player_claims`
  return rows.map((r) => r.player_id as string)
}
