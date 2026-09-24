# Operations

Running, deploying and recovering Shedquarters. For what the pieces are, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Local setup

Requires **Node 20.12+** and Docker.
The version floor matters: `npm run migrate` and `npm run smoke` pass `--env-file-if-exists`, which older 20.x doesn't have.
On Node 20.9–20.11 setup fails at the migrate step with an unknown-option error that doesn't name the cause. `engines` in `package.json` enforces the floor.

```bash
# 1. Postgres (if the container already exists: docker start houseladder-pg)
docker run -d --name houseladder-pg \
  -e POSTGRES_PASSWORD=houseladder -e POSTGRES_USER=houseladder -e POSTGRES_DB=houseladder \
  -p 55432:5432 postgres:17-alpine

# 2. Dependencies
npm install

# 3. Environment (see the table below)
cp .env.example .env.local

# 4. Schema
npm run migrate     # reads .env.local; prints the resulting table list

# 5. Tests
npm test

# 6. App
npm run dev         # http://localhost:3000
```

`npm run smoke` runs a full session against the local database (start, log, undo, idempotent replay, end) and cleans up after itself.

### Destructive-work guard

`tests/backup-dump.test.ts` and `scripts/smoke-session.ts` delete the sessions they create, which cascades to `games`, and `tests/gate-db.test.ts` clears `auth_attempts`.
All three call `assertLocalDatabase()` from `lib/db-guard.ts` first and refuse to run unless `DATABASE_URL` points at localhost.
`npm test` reads `.env.local`, and pointed at production it would destroy real game history.
Anything else that hard-deletes rows must call the same guard.

## Checks

```bash
npx next build      # must run first
npx tsc --noEmit
npx eslint
npm test
```

**Build before typecheck.** Next 16 generates route types (`LayoutProps`, `PageProps`) into `.next/types` during the build, and `app/layout.tsx` uses `LayoutProps`.
On a clean checkout `tsc --noEmit` fails with "Cannot find name 'LayoutProps'" until a build has produced them.
CI (`.github/workflows/ci.yml`) runs the same four against a Postgres 17 service container.

## Environment variables

| Variable | Where | What it is |
|---|---|---|
| `DATABASE_URL` | local + production | Postgres connection string. Locally the container above; in production a **Neon pooled** connection string with `?sslmode=require`. |
| `HOUSE_PASSCODE` | local + production | The shared house **PIN** (4 digits). Not authentication and not per-person; it exists so the deployment isn't world-writable. Unset fails closed. **Changing it signs out every device.** |
| `AUTH_SECRET` | local + production | Long random string that signs the session cookie and derives the invite link. Unset fails closed like `HOUSE_PASSCODE`. Generate with `openssl rand -hex 32`; never reuse the local value. Rotating it signs out every device and changes the invite link. |
| `CRON_SECRET` | production (and locally to test the route) | Bearer token the nightly backup requires. Vercel Cron sends it automatically. Unset makes the route return 500 with no database work, which means silent backup failures rather than an open endpoint. |
| `BLOB_READ_WRITE_TOKEN` | production | Injected by Vercel once Blob storage is attached. Never generated or pasted by hand. |

`.env.example` holds the local defaults. `.env*` is gitignored apart from `.env.example`.

## Production

Vercel (Hobby) + Neon (Free) + Vercel Blob, all on free tiers: 1M invocations a month, 100 CU-hours, 1 GB of Blob, and one daily cron.
Served at [shed.lukeghanna.com](https://shed.lukeghanna.com) through a DNS-only Cloudflare CNAME to Vercel.

**Raise Neon's scale-to-zero idle timeout from the 5-minute default to 1 hour** (Neon → project → Settings → Compute).
At the default the database sleeps between games, and a mid-session tap pays up to a 3-second cold start on the party iPad.
At the 0.25 CU floor, 100 CU-hours is roughly 400 hours of warm compute a month against an expected ~40, so an hour of idle warmth costs nothing that matters.

### First deploy

```bash
# 1. Two separate secrets (don't reuse local values, don't use one for both)
openssl rand -hex 32   # CRON_SECRET
openssl rand -hex 32   # AUTH_SECRET

# 2. Link the project. Decline the offer to create a Postgres: this app uses Neon via DATABASE_URL.
vercel link

# 3. Production env vars
vercel env add DATABASE_URL production
vercel env add HOUSE_PASSCODE production
vercel env add CRON_SECRET production
vercel env add AUTH_SECRET production
vercel env ls production      # all four must be listed before deploying

# 4. Attach Vercel Blob in the dashboard's Storage tab (injects BLOB_READ_WRITE_TOKEN)

# 5. Schema. An inline variable beats .env.local, so this targets Neon.
DATABASE_URL='<the Neon connection string>' npm run migrate

# 6. Deploy
vercel --prod
```

Then verify:

- `/` renders the leaderboard.
- `/table` redirects to `/gate`; the PIN gets you in, and a wrong PIN says so.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/backup` returns `{"ok":true,"url":"…","games":N}`.
- The same `curl` without the header returns 401.
- The blob from that URL has every player, session and game, and no `ratings_cache`.
- `vercel crons ls` lists the backup at `0 9 * * *` (9am UTC, 1–2am in Los Angeles, after a night has ended).

### Schema migrations

Production builds run `npm run migrate` before `next build` (the `buildCommand` in `vercel.ts`), using the production `DATABASE_URL`, which Vercel provides at build time.
`lib/schema.sql` is idempotent and only ever adds things, so this is a no-op on a deploy with no schema change, and the version still serving traffic keeps working while the new one builds.
If the migration fails, the build fails and the previous deployment stays live.
Preview builds skip it: `DATABASE_URL` is production-only, and a preview must never change the production schema.

To run it by hand anyway: `DATABASE_URL='<the Neon connection string>' npm run migrate`.

### After every deploy

```bash
npx tsx scripts/smoke-prod.ts
INVITE_LINK="https://<domain>/join/<token>" npx tsx scripts/smoke-prod.ts   # also proves the invite works
```

It exits non-zero on the first failure.
It checks that the rankings, gate, game log and head-to-head load; that `/table`, `/roster` and `/who` bounce a signed-out phone to the gate; that a dead invite link explains itself; that an unknown player 404s; and that the home-screen app's files are served.
With `INVITE_LINK` it also checks that the link signs a phone in and reaches the table.

### The invite link

The link is derived, never stored, and there's no screen that shows it yet. Build it from the production secret and the current version (1 unless it's been reset):

```bash
node -e 'console.log(require("crypto").createHmac("sha256", process.env.AUTH_SECRET).update("invite:" + (process.env.V || 1)).digest("base64url"))'
```

The link is `https://<domain>/join/<that token>`.
To revoke it, increment `house_settings.invite_version`, which signs out every phone that entered under the old version.

## Recovering from a lockout

The gate's global lockout (20 wrong PINs in 24 hours; see [ACCESS.md](ACCESS.md)) is a rolling window over failures, not a timer.
It lifts only once the oldest counted failure is more than 24 hours old, so someone sending a few wrong guesses a day can keep it locked indefinitely.
Signed-in devices keep working throughout.

To clear it by hand, in Neon's SQL editor:

```sql
delete from auth_attempts where success = false;
```

Only ever that table.

**Most of the house shares one IP at a party.** Home and campus wifi put every device behind one public address, so in practice the per-IP limit is a per-network limit.
Five wrong PINs from anyone on the wifi block *new* sign-ins from the whole network for 15 minutes. Same fix if it needs clearing early.

### If the PIN leaked and the gate is already locked

Order matters. Changing `HOUSE_PASSCODE` doesn't clear `auth_attempts`, because failures are counted by IP hash, not by PIN.
Rotating it mid-lockout gives the new PIN the same lockout, and nobody, including the iPad, can sign in.

1. Clear the failure history: `delete from auth_attempts where success = false;`
2. Change `HOUSE_PASSCODE` in Vercel and redeploy.
3. Sign every device that needs write access back in at `/gate` right away, starting with the scorekeeping iPad.
4. Whoever has the leaked PIN can re-lock the gate with 20 more wrong guesses. Signing the important devices back in immediately after step 2 is what limits the damage.

Change the PIN at least once a semester in any case. It resets an attacker's progress, since they can't tell which guesses were tried against the new one.

## Changing the session format

The `house` cookie carries a format tag (`CURRENT_FORMAT` in `lib/auth-token.ts`).
**Changing a token's shape signs out every phone in the house at once**, mid-game, with whatever screen they had open failing on the next tap. That has happened once, to a real housemate.

When the format has to change:

1. Add the new tag as `CURRENT_FORMAT` and **leave the old tag in `ACCEPTED_FORMATS`**. Phones with the previous format keep working and get re-issued on their next successful request.
2. Retire the old tag only once every phone has been re-issued: a year, or sooner after a PIN change or invite reset, both of which sign everyone out on purpose.
3. `tests/auth-token.test.ts` pins this.

## Naming

The app is **Shedquarters** in full, **Shed** in prose, **SHEDHQ** as the mark (`components/ui/Wordmark.tsx`).
User-facing copy never says "the house"; it's the Shed.
"Housemate" stays as the roster's word for a resident as opposed to a guest, because that's what the flag means in the data.
The package and database are still named `house-ladder` / `houseladder` from before the rename.
