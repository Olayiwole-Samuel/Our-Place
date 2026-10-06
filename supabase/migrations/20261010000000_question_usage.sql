-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — question usage (Phase 6A)
--
-- Which questions each couple has already been given, per game, so they aren't
-- repeated while unseen ones remain (lib/game/questions/provider.server.js).
-- Question CONTENT lives in versioned code today (curated banks) and will gain
-- a stored bank when AI generation arrives; usage is tracked by stable id.
--
-- Server-only: written and read with the service role by the game server after
-- it has verified the session's couple. Clients have no access at all.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.question_usage (
  couple_id uuid not null references public.couples (id) on delete cascade,
  game_id text not null check (game_id ~ '^[a-z][a-z0-9_]{0,47}$'),
  question_id text not null check (question_id ~ '^[a-z0-9][a-z0-9_:-]{0,63}$'),
  used_at timestamptz not null default now(),
  primary key (couple_id, game_id, question_id)
);

comment on table public.question_usage is
  'Questions a couple has been given (per game), to avoid repeats. Server-only.';

create index question_usage_least_recent_idx on public.question_usage (couple_id, game_id, used_at);

alter table public.question_usage enable row level security;
-- No policies: nobody but the service role (which bypasses RLS) can touch it.
revoke all on public.question_usage from anon, authenticated;
grant select, insert, update, delete on public.question_usage to service_role;
