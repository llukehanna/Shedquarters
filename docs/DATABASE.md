# Database

Postgres 17. The schema is `lib/schema.sql`, applied by `npm run migrate`.
Every statement is idempotent (`create … if not exists`, `add column if not exists`), so migrating is just re-running the file.

## Tables

| Table | Holds | Notes |
|---|---|---|
| `players` | Name, housemate or guest, nicknames | `display_name` is unique; nicknames aren't, on purpose (two people can both be "Big Cat") |
| `sessions` | One night of play | `game_type` is the night's sport; `target_score` is what the next game defaults to; `holders` / `challengers` are the live table state; `ended_at` closes the night |
| `games` | Every game ever played | **Append-only** apart from `voided`. The source of truth for everything derived |
| `ratings_cache_by_sport` | One row per sport: the latest replay | Keyed by a fingerprint of that sport's `games`; see [RATINGS.md](RATINGS.md) |
| `ratings_cache` | Unused | The single-row cache from before spikeball, kept so an old deploy still works mid-rollout. Safe to drop |
| `auth_attempts` | Gate attempts | IPs stored only as an HMAC; rows deleted after 7 days |
| `player_claims` | Which players a phone has claimed | One row per player; a new phone updates it |
| `house_settings` | One row: `invite_version` | The invite link is derived from it and never stored |

## `games`

```sql
id         uuid primary key
ord        bigserial unique          -- global replay order
session_id uuid → sessions           -- the night
seq        int                       -- game number within the night, unique per session
team_a     uuid[]                    -- always the team holding the table going in
team_b     uuid[]                    -- the challengers
winner     'a' | 'b'
score_a, score_b  int >= 0
voided     boolean                   -- an undo; never reverted
client_id  uuid unique               -- generated on the phone; the idempotency key
game_type  'beer_die' | 'spikeball'  -- copied from the night, so ladders filter without a join
target_score int                     -- what this game was played to: 21, or 25 / 15 / 11
created_at timestamptz
```

Three columns carry most of the design:

- **`ord`** is the only ordering the replay trusts. `created_at` can be wrong: device and server clocks drift, and an offline queue can drain a game hours after it was played. The game log groups games by session and orders them by `ord`, and rank movement cuts history at an `ord` boundary, for the same reason.
- **`team_a` is always the holders.** That makes a game row enough to rebuild the table as it stood before the game, which is exactly what undo does.
- **`client_id` is unique**, so the same game sent twice (a retry after a lost response) can't become two rows.

## What's deliberately missing

- **No stored ratings.** They're derived; the cache is disposable.
- **No hard deletes of games.** A delete or an un-void would break the cache fingerprint's monotonicity. Undo is a void.
- **No user accounts or passwords.** See [ACCESS.md](ACCESS.md).

## Backups

A nightly cron writes `players`, `sessions` and `games` to Vercel Blob as `backups/YYYY-MM-DD.json`.
`ratings_cache` is left out because it's derived.
Restoring means loading those three tables; the next read rebuilds the ratings.
