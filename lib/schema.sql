create extension if not exists pgcrypto;

create table if not exists players (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  photo_url    text,
  is_housemate boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  game_type    text not null default 'beer_die',
  target_score int  not null default 21,
  win_by       int  not null default 2,
  team_size    int  not null default 3,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);

create table if not exists games (
  id         uuid primary key default gen_random_uuid(),
  ord        bigserial not null unique,
  session_id uuid not null references sessions(id) on delete cascade,
  seq        int  not null,
  team_a     uuid[] not null,
  team_b     uuid[] not null,
  winner     text not null check (winner in ('a','b')),
  score_a    int  not null check (score_a >= 0),
  score_b    int  not null check (score_b >= 0),
  voided     boolean not null default false,
  client_id  uuid not null unique,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index if not exists games_ord_idx on games (ord);

create table if not exists ratings_cache (
  id          int primary key default 1 check (id = 1),
  fingerprint text not null,
  payload     jsonb not null,
  computed_at timestamptz not null default now()
);

alter table sessions add column if not exists holders    uuid[];
alter table sessions add column if not exists challengers uuid[];

-- Gate rate limiting (lib/gate.ts). Serverless instances share no memory, so
-- the limiter lives here. ip_hash is HMAC-SHA256(AUTH_SECRET, ip): raw client
-- IPs are never stored. Rows older than 7 days are deleted opportunistically
-- during gate attempts.
create table if not exists auth_attempts (
  id         bigserial primary key,
  ip_hash    text not null,
  success    boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_attempts_created_at_idx on auth_attempts (created_at);

-- One row per player whose phone has claimed them (lib/identity.ts). A reclaim
-- from a new phone updates claimed_at rather than inserting a second row.
create table if not exists player_claims (
  player_id  uuid primary key references players(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

-- Single row. Holds the invite version only: the invite token is derived as
-- HMAC(AUTH_SECRET, "invite:" + invite_version), so no usable link is stored
-- and a database leak exposes nothing. Bumping the version changes the link
-- and signs out every phone (lib/auth-token.ts).
create table if not exists house_settings (
  id             int primary key default 1 check (id = 1),
  invite_version int not null default 1
);

insert into house_settings (id, invite_version) values (1, 1) on conflict (id) do nothing;

-- Nicknames shown on a player's profile (app/(tabs)/players/[id]), in the
-- order they were added. A player can hold several — the point is that
-- housemates pile them on. Not unique against each other, another player's
-- nicknames, or any display_name: two players may both be "Big Cat".
alter table players add column if not exists nicknames text[] not null default '{}';

-- Per-game rating deltas (app/(tabs)/games/page.tsx), cached alongside the
-- ratings payload behind the same fingerprint (lib/ratings-cache.ts) rather
-- than in a table or shape of its own. Nullable: a row written before this
-- column existed reads back as a cache miss for deltas specifically (not a
-- crash and not a stale `payload` shape), and self-heals on the next write.
alter table ratings_cache add column if not exists deltas jsonb;

-- Spikeball (lib/domain/sport.ts). `sessions.game_type` and `target_score`
-- have been there from the start, and a game now carries its own copy of both.
-- The sport is copied from its night so every ladder query can filter games
-- without a join, and the target is per game because spikeball's length is
-- picked game by game (25, 15 or 11). Every existing row is a beer die game
-- to 21, which is exactly what the defaults say.
alter table games add column if not exists game_type    text not null default 'beer_die';
alter table games add column if not exists target_score int  not null default 21;

create index if not exists games_game_type_ord_idx on games (game_type, ord);

-- One cached replay per sport (lib/ratings-cache.ts). Same contract as the
-- single-row `ratings_cache` above, keyed by sport instead of pinned to id 1.
-- Ratings never cross sports, so neither does the cache or its fingerprint.
-- `ratings_cache` is left in place so a deploy that is still running the old
-- code can keep using it. Nothing new reads or writes it.
create table if not exists ratings_cache_by_sport (
  game_type   text primary key,
  fingerprint text not null,
  payload     jsonb not null,
  deltas      jsonb not null,
  computed_at timestamptz not null default now()
);
