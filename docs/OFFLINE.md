# Offline writes

Games get logged at a party, in a backyard, on wifi that comes and goes.
The biggest operational risk isn't a bug. It's a game tapped in at the table that never reaches the database, with nobody noticing until the next day.
The write path is built around one rule: **a stuck queue can be recovered, a discarded game can't.**

## The flow

```
tap "Log it"
  → enqueue(game)                  localStorage, key house-ladder-queue
  → table = applyPending(serverTable, pending())      shown immediately
  → flush()
      for each queued game, oldest first:
        POST /api/games
          2xx           → remove from queue, count as sent
          401           → stop; retry later (the cookie can be re-established)
          other 4xx     → move to dead-letter list, keep draining
          5xx / network → stop; retry later
  → if anything was sent: router.refresh()   pull the server's table state
```

Each game carries a `clientId`, a UUID generated on the device when the game is logged.
It's the idempotency key the whole design relies on.

## What the table shows

Table mode keeps two things apart:

- `serverTable`: the table as of the last games the server accepted.
- `pending()`: the games still in the queue.

What's on screen is always `applyPending(serverTable, pending())`, a pure function in `lib/domain/table.ts` that replays the queued games on top of the server's state.
A game logged offline immediately moves the winners onto the table, bumps the run count, and brings the next challengers up, exactly as if it had been saved.

Every way a game leaves the queue has to keep that invariant:

- A flush that sends games removes exactly the games it sent, then refreshes `serverTable`.
- A game that gets dead-lettered never reaches the server, so `serverTable` is still right. But the display was built assuming it would land, so it's recomputed from `serverTable` plus what's left in the queue.
- Undo on a game that's still queued just drops it from the queue (`dropLast`). Nothing was sent, so there's nothing to void.

## Draining

Table mode drains on load, when the browser fires `online`, on a 15-second interval, and after every game.
With four triggers, overlapping drains are routine.

An early version let them run in parallel. Two drains would each read the same first game, both POST it (the server's idempotency made that harmless), and then each remove *one* item from the queue.
The second removal deleted a game that had never been sent.

`flush()` now keeps a single in-flight promise. A second caller joins the drain already running instead of starting another.
Each removal also re-reads the queue first, so a game queued while a drain is running isn't lost.

The drain is strictly FIFO and stops at the first transient failure.
`seq` (the game's number within the night) is assigned on the server as `max(seq) + 1`, so sending games out of order would scramble the night.

## Transient and permanent failures

The queue has to decide, from a status code alone, whether retrying could ever help.

| Response | Meaning | Queue does |
|---|---|---|
| 2xx | Recorded (or already recorded) | Remove, continue |
| 401 | Cookie missing or expired | Stop, retry later |
| Other 4xx | The server will never accept this game | Dead-letter, continue |
| 5xx, network error | Anything else | Stop, retry later |

Retrying a permanent rejection forever would block every game behind it. On a party iPad, fixing that means clearing `localStorage` by hand.
So permanently rejected games go to a separate `house-ladder-dead` list. They aren't deleted: they're the only remaining record of a game that happened.
Table mode shows a banner with the count, and it won't end the night while any are there.

### The server's side: an allowlist, not a fallback

Because any 4xx other than 401 means "never retry", the server has to be sure before sending one.
`app/api/games/route.ts` maps errors to status codes with an explicit list of client-fault messages (a malformed body, an ended session, a player on both teams, an invalid losing score).
Anything not on that list is a 500, including a Neon cold start refusing a connection, a timeout, or a bug in the route. Those are retryable, so the game stays queued.

That puts the risk on the safe side: a new failure mode retries until someone adds it to the list, instead of silently dead-lettering real games.
Four tests pin the known cases.

## Idempotency on the server

`logGame` in `lib/session.ts`:

1. Checks the losing score is valid.
2. Returns early if a game with this `clientId` already exists. A retry after a lost response lands here.
3. Checks the session is active and the next challengers don't overlap the winners.
4. In one transaction: computes the next `seq`, inserts the game (`on conflict (client_id) do nothing`), and updates the session's holders and challengers.

The order matters. An earlier version inserted the game, then validated, then updated the session.
A game rejected at validation had already been inserted. When the queue retried it with the same `clientId`, step 2 returned early and the table state was never updated. The session stayed stranded.
All validation now happens before any write, and the two writes commit together or not at all.

`voidLastGame` follows the same rule in reverse: marking the game voided and restoring the table to that game's `team_a` / `team_b` happen in one transaction.

## UI state across tabs

Switching from Table to Ranks and back remounts table mode.
`lib/client/persist.ts` saves which screen was open, the challengers picked so far, and any half-edited lineup, keyed by session.
It also saves the `seq` it was drawn against: if another phone logged a game in the meantime, the saved screen describes a table that no longer exists, so it falls back to "Who won?".
This is display state only and never feeds the queue.

## Known gaps

- Undo while a POST is in flight can drop a game the server has already accepted, which makes that undo do nothing.
- A fast double tap on "Log it" can land on "Undo last game", which appears in about the same place.

Both are tracked in [FOLLOWUPS.md](FOLLOWUPS.md).
