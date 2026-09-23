# Access: the PIN, the invite link, and "Who are you?"

The house asked for no accounts, no passwords, and nothing that slows down fifteen people at a party.
What it needs is narrower: keep strangers on the internet from writing games, and know which phone belongs to which player.

Reading is public. The rankings, player pages, game log and head-to-heads need no sign-in.
Writing (logging games, changing teams, editing the roster) needs a signed session cookie, which a phone gets in one of two ways.

## Getting in

| Way in | Who uses it | Rate limited |
|---|---|---|
| **House PIN** at `/gate` | Anyone standing in the Shed | Yes, heavily |
| **Invite link** `/join/<token>` | Sent in the group chat | No: the token is 32 random-looking bytes, so there's nothing to guess |

Both issue the same cookie. After either one, "Who are you?" asks the phone to pick its player.

## The PIN

A four-digit PIN is 10,000 possibilities, which is weak on its own.
The design keeps it safe by allowing it to be checked in exactly one place, slowly.

**The cookie never holds the PIN.** A successful sign-in sets the `house` cookie (`httpOnly`, `sameSite=lax`, `secure`, one year) to a signed token:

```
v2 . issuedAt . playerId-or-"-" . inviteVersion . HMAC-SHA256(AUTH_SECRET, all of that + sha256(HOUSE_PASSCODE))
```

Every write checks that signature and nothing else.
Sending `Cookie: house=0000` through `9999` at the write API is 10,000 invalid tokens and 10,000 `401`s.
The first version of the app did store the PIN in the cookie, which let anyone skip the rate limit entirely. The review that caught it is why the gate works this way.

**The gate is rate limited in Postgres.** Serverless instances share no memory, so an in-process counter would reset on every cold start and differ between instances.
`lib/gate.ts` keeps an `auth_attempts` table and, for each attempt:

1. Takes a transaction-scoped advisory lock, so attempts run one at a time. Without it the check is check-then-act, and 100 parallel guesses would all read "0 failures" and all be compared.
2. Counts recent failures using `clock_timestamp()`, not `now()`. `now()` is the transaction's start time, before the lock wait, so a request that queued for a few seconds would count against a stale window.
3. Refuses before comparing if either limit is hit, so a locked-out request learns nothing about whether its guess was right.
4. Compares the PIN in constant time. Both sides are hashed to 32 bytes first, so a wrong length takes the same path as a wrong digit.
5. Records the result.

The lock wait is capped at 5 seconds (`set local lock_timeout`). A flood of guesses fails fast with "busy" instead of holding pooled connections the game writes need.
Client IPs are stored only as an HMAC keyed by `AUTH_SECRET`, and rows older than 7 days are deleted as attempts come in.

| Limit | Value |
|---|---|
| Per IP | 5 wrong PINs in a rolling 15 minutes |
| Global | 20 wrong PINs from all IPs in a rolling 24 hours |

The per-IP limit only stops one fat-fingered phone from burning the house's budget. Attackers rotate IPs, so the global limit is the real protection.
It caps guessing at 20 a day in total:

| | |
|---|---|
| Possibilities | 10,000 |
| Expected guesses to find it | ~5,000 ≈ **250 days** |
| Worst case | 500 days |

Changing the PIN resets that progress, since an attacker can't tell which guesses were tried against the new one.

The trade-off is deliberate: someone determined can lock the gate for everyone by guessing wrong 20 times a day.
Phones that are already signed in keep working throughout, because writes check the cookie, not the gate.
Clearing a lockout by hand is in [OPERATIONS.md](OPERATIONS.md#recovering-from-a-lockout).

## The invite link

```
token = base64url( HMAC-SHA256(AUTH_SECRET, "invite:" + invite_version) )
```

The database stores only `invite_version`, an integer.
The link itself is never stored: the server can rebuild it whenever it needs to, and a database leak exposes no usable link.
A token that doesn't match the current version, whether it's malformed or from before a reset, redirects to `/gate?invite=stale` with an explanation, and no cookie is set.

## Revoking access

Two levers sign out every device at once, and both work through the signature:

- **Change `HOUSE_PASSCODE`.** The PIN's hash is inside every signature, so every existing token fails to verify.
- **Bump `invite_version`.** Every request compares the token's invite version to the current one, so old tokens and the old link both stop working.

Changing the token *format* also signs everyone out, but that's not meant to be a lever.
It happened once by accident, and it put a raw React error in front of a housemate mid-game.
Formats now carry a tag (`v2`), and `ACCEPTED_FORMATS` keeps the previous tag readable for at least one release so phones get re-issued gradually.
`tests/auth-token.test.ts` pins that every accepted tag reads, unaccepted tags don't, and the tag is covered by the signature so it can't be swapped.

## "Who are you?"

Once signed in, a phone picks its player (or adds itself as a guest).
The choice is signed into the same cookie, and a `player_claims` row records that the player has been claimed. The picker marks claimed names, and claiming one from a new phone moves it.

This is identity, not authentication: anyone signed in could claim any name.
It exists so the app knows whose phone it is, and it relies on the same trust as the shared PIN.

## Failing closed

- `HOUSE_PASSCODE` or `AUTH_SECRET` unset: nobody can sign in, and every write is refused with a 500 rather than treated as "no auth needed".
- `CRON_SECRET` unset: the backup route returns 500 and does no database work, rather than serving the full dump to anyone.
- A database error while checking a session propagates. It isn't swallowed into "signed out", so a broken deployment fails loudly.
