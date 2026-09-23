# Ratings and stats

Every number on the rankings page comes from replaying the `games` table in order.
No rating is ever stored as a fact. The only stored copy is a cache that knows when it's stale.

## The replay

`computeRatingsAndDeltas` in `lib/domain/ratings.ts`:

1. Drops voided games.
2. Sorts by `ord`, a `bigserial` assigned on insert.
3. Starts every player at OpenSkill's default (μ = 25, σ ≈ 8.33).
4. For each game, calls `rate()` with both teams, the two scores, and `margin: 5`, then records each side's average change.
5. Returns every player's rating plus a per-game delta map keyed by `ord`.

The displayed rating is OpenSkill's **ordinal**, μ − 3σ: a conservative estimate that starts at 0 and rises as the system becomes more confident.
A new player's σ is wide, so a hot first night doesn't put them at #1 above someone with forty games.
Players are marked **provisional** until 10 games.

### Why replay instead of updating in place

Rating updates don't commute: the same games in a different order give different ratings.
Storing ratings and updating them per game would make every correction a special case.
An undo would need to reverse an update, and a tuning change (the margin, the provisional line) would need a migration.

Replaying makes all of that the same operation.
An undo sets `voided = true` and the next read replays without it.
Changing `MARGIN` changes every rating from the first game on, consistently.

The replay is deterministic. `ord` is unique, and the sort still has a content-derived tie-breaker, so the result can't depend on the order rows come back from the database.
It also validates as it goes: a player on both teams, or a declared winner whose score is lower, throws instead of producing a quietly wrong rating.

### Margin of victory

OpenSkill v5 supports margin natively.
With `margin: 5`, any win by 5 or fewer is an ordinary win. Past that, the update is amplified by `log(1 + (gap − 5))`.
A 21–0 skunk counts for noticeably more than a 21–15 win, but it takes a lot of blowouts to outweigh a lot of wins.

## The cache

A full replay is cheap at this scale, but every page needs it, so it's cached in `ratings_cache`, a single row.

```
fingerprint = count(games) : max(ord) : count(voided games)
```

On each read, `getRatings()` computes the fingerprint (one aggregate query) and compares it to the cached row.
If they match, it returns the cached payload. If not, it replays, writes the row, and returns the fresh result.

This only works because every part of the fingerprint only ever goes up:

- Games are never deleted, so the count never drops.
- `ord` is a sequence, so the max never drops.
- A void is never undone, so the voided count never drops.

Any write changes at least one of the three, so a stale cache can't match a newer fingerprint.
**Adding hard deletes or un-voiding would break this**, and the cache would start serving stale ratings. That's recorded in [FOLLOWUPS.md](FOLLOWUPS.md) as a guard to add before either feature.

Ratings and per-game deltas are cached together, in two columns, from one replay.
The rankings page reads only `payload`, and the game log reads only `deltas`.
A miss on either recomputes both from the same snapshot of `games`, so a ratings list and a deltas map from different moments can never be paired.

## Derived stats

All of these are pure functions in `lib/domain/`, computed per request from the game list.

| Stat | Where | Rule |
|---|---|---|
| Streak | `stats.ts` | Current run of consecutive wins or losses (`W3`, `L2`) |
| Movement | `movement.ts` | Places moved in the last 7 days. The "before" ranking replays the longest prefix of history (by `ord`) older than 7 days, so it's a state that actually existed |
| Point differential | `stats.ts` | Total and per-game points for minus points against |
| Head-to-head | `stats.ts` | Wins and losses against a player, plus games as teammates. Under 8 meetings it says so ("That's a coin flip, not a rivalry") |
| Longest runs | `stats.ts` | Most consecutive games a roster held the table |
| Most carried | `stats.ts` | Win rate with a given teammate versus without, 5-game minimum |
| Shed of shame | `shame.ts` | Longest losing skid, worst differential, and last place among non-provisional players. Each slot needs 5+ games, the last one needs 4+ established players, and no player takes two slots. A slot with nobody eligible is left out rather than filled with a fluke |

### Badges

`lib/domain/badges.ts`. The copy lives next to the rule and is built from the same constants, so a badge can't claim a different threshold than it enforces.

| Badge | Earned by |
|---|---|
| Skunk ×N | Winning a game 21–0 |
| Heartbreaker ×N | Winning a game that went past 21 by exactly 2 |
| Rookie | Fewer than 10 games (the provisional line) |
| Ghost | No games in 21 days |

### Loser's tax

After a game is entered, table mode prints "Loser's tax." under any result won by 11 or more.
It's display only and deliberately doesn't reuse the rating `MARGIN`: how much a score moves a rating and what the table says out loud are separate decisions.
