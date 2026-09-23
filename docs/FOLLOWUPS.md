# Known follow-ups

Carried deliberately out of House Ladder v1. None blocks use; each was reviewed and ruled on
during execution rather than discovered afterwards.

## Worth doing before the ladder gets heavy use

- **No component test harness.** `vitest.config.ts` is `environment: 'node'` with no jsdom, so the
  dead-letter UI surface — the "N games not recorded" banner, Dismiss, and the refuse-to-end
  message — is covered only by build and typecheck. Two cases to write first: a drain that
  dead-letters must not render "all synced", and the end-session gate must refuse while
  `deadCount() > 0`.
- **`dropLast()` during an in-flight POST** can drop a game the server already accepted, making
  that Undo a silent no-op. Pre-dates the offline-queue fix waves.
- **A fast double tap on "Log it" can land on "Undo last game".** After logging, the winner view
  renders with Undo near where "Log it" was, and Undo drops the just-logged game without confirming.
  Needs an in-flight guard or an Undo confirm; left alone in the Shedquarters design plan because it
  changes handler logic.
- **Deuce pad tops out at 39.** Task 6 of the Shedquarters design plan replaced `window.prompt`
  (which accepted any integer from 20 up) with a 20–39 on-screen pad. A losing score of 40+ can't be
  entered until someone widens it.

## Maintenance obligations

- **`ACCEPTED_FORMATS` in `lib/auth-token.ts` is a compatibility window, not decoration.** A format
  change that drops the old tag signs out every phone in the house at once — it already put a
  minified React error in front of a housemate mid-game. Keep the previous tag for at least one
  release; see "Changing the session format" in docs/OPERATIONS.md.

- **The 400 allowlist in `app/api/games/route.ts` is a snapshot.** Only enumerated client-fault
  messages map to 400 (terminal, dead-lettered); everything else is 500 (retryable). A new `throw`
  in `logGame` or `parseLogGameInput` will therefore retry rather than dead-letter until it is
  added. That is the safe direction, and four guardrail tests pin the known cases — but the list
  has to be maintained.
- **`getRatings()` reads its fingerprint before it reads games.** This is self-healing only while
  every fingerprint term is monotonically non-decreasing: the stored payload can lead its label but
  never lag it, so a mismatch forces a correct recompute. **Adding un-void or hard-delete of games
  breaks this** and would let the cache serve stale ratings. Guard it before adding either.

## Cosmetic / cleanup

- `Table.seq` is now dead — nothing reads it since the `Game N` label was dropped. Deleting it also
  retires the note about `seq` skipping voided rows.
- `sameRoster` (`lib/session.ts`) and `key` (`lib/domain/stats.ts`) are the same function with
  different separators. Run length is computed three ways that agree today with nothing keeping
  them agreeing.
- `longestRuns` walks global `ord` order and ignores session boundaries, so a roster winning the
  last game of one night and the first of the next reads as one continuous run.
- `games.ord` is `bigserial unique` *and* carries `games_ord_idx` — the unique constraint already
  builds a btree, so the extra index is redundant.

## Deferred by design

Inactivity rating decay (documented in the spec), the "who's next" queue, accounts, realtime
multi-device sync, the cross-game House Cup, games beyond beer die, and tournament bracket
generation. None requires a schema change to add later.
