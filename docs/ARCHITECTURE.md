# Architecture

Shedquarters is a Next.js 16 App Router app with one Postgres database behind it.
Every page renders on the server from live data (`dynamic = 'force-dynamic'`).
Almost everything the pages show is derived from one append-only table of games.

```
Phone (any device)                           Vercel (Fluid Compute)                 Neon Postgres
├── Rankings, player, log, h2h  ── GET ──►   server components ── queries ──►       players
│                                             └── getRatings() ── fingerprint ──►    games  (append-only)
├── Table mode                                                                       sessions (table state)
│   ├── localStorage queue ─ POST /api/games ─► requirePasscode → validate → logGame  ratings_cache
│   └── server actions ────────────────────► requirePasscode → lib/session.ts       auth_attempts
├── /gate (PIN keypad) ──── server action ─► attemptGate (rate limited, locked)      player_claims
└── /join/<token> ───────── GET ───────────► enterWithInvite                         house_settings

Vercel Cron, 09:00 UTC ── GET /api/cron/backup (Bearer CRON_SECRET) ──► JSON dump → Vercel Blob
```

## Layers

The code is split so that every rule lives somewhere it can be tested without a browser or a database.

| Layer | Path | Knows about | Doesn't know about |
|---|---|---|---|
| Domain | `lib/domain/` | Games, scores, ratings, lineups, badges | Postgres, React, requests, env vars |
| Data | `lib/session.ts`, `lib/queries.ts`, `lib/identity.ts`, `lib/ratings-cache.ts` | SQL, transactions | Auth, cookies |
| Auth | `lib/auth.ts`, `lib/auth-token.ts`, `lib/gate.ts` | Cookies, secrets, rate limits | Game rules |
| Entry points | `lib/actions.ts`, `app/api/**/route.ts` | Auth + data, cache revalidation | |
| Client | `lib/client/`, `components/` | `localStorage`, rendering | SQL |
| UI helpers | `lib/ui/` | Formatting and labels, as pure functions | |

`lib/session.ts` has no auth and no cache imports, and `lib/actions.ts` calls `requirePasscode()` as the first line of every export.
That split means a data function can't be reached without an auth check, and can be tested without faking one.

Components hold as little logic as possible.
`components/LineupEditor.tsx` renders slots and forwards taps. Every lineup operation is a pure function in `lib/domain/lineup.ts`.
`components/ui/Wordmark.tsx` holds two handlers that call into `lib/domain/easter-egg.ts`, which is a clock-injected state machine.
The reason is testing: a pure function is tested directly, in Node, while a component needs a DOM to test at all.
Component tests do exist (`tests/*.test.tsx`, jsdom via a `// @vitest-environment jsdom` comment, Testing Library), but they cover how a screen wires things together, such as `TableMode`'s queue, sync status and Undo guard, not rules that could live in `lib/`.

## Routes

| Route | Access | What it is |
|---|---|---|
| `/` | public | Power rankings for the phone's sport: rating, record, streak, 7-day movement, "Shed of shame" |
| `/players/[id]` | public | Both sports at once: a card per sport (rank, rating, record, win %, streak, point differential, badges) and head-to-head with a record per sport |
| `/games` | public | Every game, newest first, grouped by night, with each side's rating change |
| `/h2h?a=&b=` | public | Two players' record against each other and as teammates |
| `/table` | signed in | Table mode for the phone's sport: start a night, log games, undo, change teams, end the night |
| `/roster` | signed in | The "Me" tab: add players, rename, add nicknames |
| `/gate` | public | The PIN keypad |
| `/join/[token]` | public | The invite link: signs the phone in without the PIN |
| `/who` | signed in | "Who are you?": binds this phone to a player |
| `POST /api/games` | signed in | The only way a game is written |
| `GET /api/cron/backup` | `CRON_SECRET` | Nightly dump to Vercel Blob |

A signed-out request to a signed-in page redirects to `/gate`, never to an error page.

## Two sports

Beer die and spikeball are two themed experiences over one roster.

- **Which sport a phone is on** lives in the `shed-sport` cookie, not the URL. `proxy.ts` turns any `?sport=` link into the cookie and redirects to the same page without it, so a shared link still lands on the right ladder, and the cookie is the only source of truth. Server components read it with `currentSport()` (`lib/sport-cookie.ts`).
- **The Die │ Spike pill** (`components/ui/SportPill.tsx`) sits in the top bar of every tab. Its halves are plain `<a>` links with `?sport=`, never `next/link`: a client-side navigation would not re-render the root layout, which is what paints the theme. The other sport's half shows a green dot while its night is live.
- **Themes.** The root layout puts `data-sport` on `<html>`. `app/globals.css` gives each sport its colours as plain variables on that scope (Old Glory for die, Ball Yellow & Black for spikeball), and the inline theme points Tailwind's tokens (`ground`, `panel`, `panel-ink`, `accent`, `fg`, …) at them. Tokens are named by job, not colour. Text on a `panel` uses `panel-ink`, which is white on die's red and black on spikeball's yellow. Any element can re-scope with its own `data-sport`: the player page is `both` (neutral) and each sport's card inside it takes that sport's colours.
- **One live night per sport.** `getActiveTable(sport)` and `getLiveSports()`, with a partial unique index (`sessions_one_open_per_sport`) that allows one open night per sport. A die night and a spikeball night can run at the same time.
- **Swiping** left or right on a tab moves between Ranks, Table and Me (`components/SwipeTabs.tsx`, rules in `lib/ui/swipe.ts`). It only counts a clearly sideways, quick drag that starts away from the screen edges, and never while a sheet is open.

## The table as a state machine

A night is a `sessions` row. Its `holders` and `challengers` columns are the table: who is holding it and who is challenging right now.
Its `game_type` is fixed when the night starts (beer die or spikeball, from `lib/domain/sport.ts`), and every game logged against it gets the same sport.
Spikeball lets the table pick 25, 15 or 11 before each game. The pick travels in the queued game itself (`targetScore`), so a game waiting in the queue is still recorded as what it was played to, and the night's `target_score` follows the last game logged.

```
startSession(holders, challengers)
      │
      ▼
 ┌─ logGame(winner, loserScore, nextChallengers) ─┐
 │    insert game (team_a = holders, team_b = challengers)
 │    holders    ← whoever won
 │    challengers ← nextChallengers                  (one transaction)
 └────────────────────────────────────────────────┘
      │  voidLastGame: voided = true, table ← that game's team_a / team_b   (one transaction)
      │  setTeams:     overwrite holders / challengers (mid-night lineup change)
      ▼
 endSession  → ended_at = now()
```

`team_a` is always the team that held the table going into the game.
So the game rows are enough to reconstruct the table at any point, and an undo can restore it exactly from the voided row.

The current run ("3 game run") isn't stored.
`getActiveTable(sport)` walks the night's games from newest to oldest while the winning roster matches the current holders.
It compares the winning roster, not `team_a`: a challenger who just took the table was `team_b` in that game.

## Reads

Pages read through `lib/queries.ts` and `lib/ratings-cache.ts`.
The expensive derived value is the rating replay. It is cached in a single-row table behind a fingerprint, described in [RATINGS.md](RATINGS.md).
Everything else (streaks, head-to-head, badges, point differential, movement, the shame board) is computed per request from the game list by pure functions in `lib/domain/`.
At house-league scale that is a few hundred rows, and not caching it means it can't go stale.

## Writes

Games go through the offline queue and `POST /api/games`; see [OFFLINE.md](OFFLINE.md).
Everything else goes through server actions in `lib/actions.ts`: starting and ending a night, undo, changing teams, the roster, and claiming a player.
Those happen while someone is looking at the screen and can retry, so they don't need a queue.

## Access

A shared PIN or an invite link gets a phone a signed cookie. "Who are you?" then records which player the phone belongs to.
See [ACCESS.md](ACCESS.md).

## Home-screen app

`app/manifest.ts` and the icons make the app installable.
`public/sw.js` is intentionally small. It never caches pages or data: rankings have to be fresh, and table mode has its own queue.
Its only job is to show `public/offline.html` instead of the browser's error page when the installed app opens with no connection.
It registers in production builds only.

## Backups

Vercel Cron calls `/api/cron/backup` daily at 09:00 UTC, after a night has ended in Los Angeles.
The route compares the bearer token in constant time before touching the database, and returns 500 with no database work if `CRON_SECRET` is unset.
The dump holds `players`, `sessions` and `games`. It leaves out `ratings_cache`, which is derived, and a replay rebuilds it.
