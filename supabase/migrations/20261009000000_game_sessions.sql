-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — game sessions (Phase 5)
--
-- Definition  lib/game/catalog.js (code)          what a game IS
-- Session     public.game_sessions (this table)   one match/activity of a couple
-- State       game_sessions.state (jsonb)         game-specific, SERVER-ONLY
-- Result      game_sessions.result (jsonb)        normalized outcome, written by the server
--
-- Authority: every write goes through the functions below, which only the
-- server (service role, after verifying the user with Supabase Auth) may call.
-- The server passes the VERIFIED user id; each function re-derives the user's
-- couple from couple_members and refuses anything outside it. Clients can read
-- their couple's sessions (RLS) but never `state` or `seed` (column grants),
-- because games may hold hidden information (a Scrabble rack, a hand of cards).
-- Each player receives their own view of the state from the server instead.
--
-- Live sync: after every change, a trigger broadcasts a compact event on the
-- couple's PRIVATE `games` topic. Clients can't write that topic (RLS), so the
-- events can't be forged; clients then fetch the authoritative view.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  game_id text not null check (game_id ~ '^[a-z][a-z0-9_]{0,47}$'),
  status text not null default 'waiting'
    check (status in ('created', 'waiting', 'ready', 'active', 'paused', 'completed', 'abandoned', 'cancelled')),
  created_by uuid not null references public.users (id) on delete restrict,
  players uuid[] not null default '{}' check (cardinality(players) <= 2),
  ready uuid[] not null default '{}' check (ready <@ players),
  -- Server-only: full authoritative state (may contain hidden information) and RNG seed.
  state jsonb check (state is null or pg_column_size(state) <= 262144),
  seed bigint,
  state_version integer not null default 0 check (state_version >= 0),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object' and pg_column_size(options) <= 4096),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  winner_id uuid references public.users (id) on delete restrict,
  -- Set by the server from the game's metadata when a result is written; the
  -- future streak system reads only rows where this is true.
  streak_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint game_sessions_winner_is_player check (winner_id is null or winner_id = any (players)),
  constraint game_sessions_finished_has_time check (status not in ('completed', 'abandoned', 'cancelled') or finished_at is not null)
);

comment on table public.game_sessions is
  'One game/activity between the couple. Written only by the game_* functions (service role). state/seed are server-only.';

-- At most one open session per couple (also stops accidental repeated creation).
create unique index game_sessions_one_open_per_couple on public.game_sessions (couple_id)
  where status in ('created', 'waiting', 'ready', 'active', 'paused');
create index game_sessions_couple_created_idx on public.game_sessions (couple_id, created_at desc);

create trigger set_updated_at before update on public.game_sessions
  for each row execute function private.set_updated_at();

alter table public.game_sessions enable row level security;

create policy "couple members read their couple's game sessions"
  on public.game_sessions
  for select
  to authenticated
  using (private.is_couple_member(couple_id));

revoke all on public.game_sessions from anon, authenticated;
grant select (id, couple_id, game_id, status, created_by, players, ready, state_version, options, result,
              winner_id, streak_eligible, created_at, started_at, finished_at, updated_at)
  on public.game_sessions to authenticated;

-- ── Abuse protection ────────────────────────────────────────────────────────
create table private.game_rate_events (
  user_id uuid not null,
  bucket text not null,
  at timestamptz not null default clock_timestamp()
);
create index game_rate_events_idx on private.game_rate_events (user_id, bucket, at desc);
revoke all on private.game_rate_events from public, anon, authenticated;

-- Records one hit; raises 'game:rate_limited' when the user exceeds p_max in p_window.
create function private.game_rate_hit(p_user uuid, p_bucket text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.game_rate_events e where e.user_id = p_user and e.bucket = p_bucket and e.at < clock_timestamp() - p_window;
  if (select count(*) from private.game_rate_events e where e.user_id = p_user and e.bucket = p_bucket) >= p_max then
    raise exception 'game:rate_limited';
  end if;
  insert into private.game_rate_events (user_id, bucket) values (p_user, p_bucket);
end;
$$;

-- The verified user's couple, or an error.
create function private.game_user_couple(p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  if p_user is null then
    raise exception 'game:not_authenticated';
  end if;
  select m.couple_id into cid from public.couple_members m where m.user_id = p_user;
  if cid is null then
    raise exception 'game:not_paired';
  end if;
  return cid;
end;
$$;

-- Locks and returns a session of the user's couple, or raises 'game:not_found'
-- (also for other couples' sessions, so their existence isn't revealed).
create function private.game_lock_session(p_user uuid, p_session uuid)
returns public.game_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.game_user_couple(p_user);
  s public.game_sessions;
begin
  select * into s from public.game_sessions g where g.id = p_session and g.couple_id = cid for update;
  if not found then
    raise exception 'game:not_found';
  end if;
  return s;
end;
$$;

-- ── Lifecycle (service role only) ───────────────────────────────────────────

-- Creates a waiting session with the creator as the first player. The server has
-- already checked the game exists and is launchable for this couple.
create function public.game_create_session(p_user uuid, p_game_id text, p_options jsonb default '{}'::jsonb)
returns public.game_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cid uuid := private.game_user_couple(p_user);
  created public.game_sessions;
begin
  perform private.game_rate_hit(p_user, 'create', 6, interval '1 minute');
  perform pg_advisory_xact_lock(hashtextextended('our_place.games.' || cid::text, 0));

  -- Sessions nobody touched for 6 hours are over.
  update public.game_sessions g
     set status = case when g.status in ('active', 'paused') then 'abandoned' else 'cancelled' end,
         result = case when g.status in ('active', 'paused')
                       then jsonb_build_object('outcome', 'abandoned', 'winnerId', null, 'scores', null, 'summary', jsonb_build_object('reason', 'expired'))
                       else g.result end,
         finished_at = now()
   where g.couple_id = cid
     and g.status in ('created', 'waiting', 'ready', 'active', 'paused')
     and g.updated_at < now() - interval '6 hours';

  if exists (select 1 from public.game_sessions g where g.couple_id = cid and g.status in ('created', 'waiting', 'ready', 'active', 'paused')) then
    raise exception 'game:session_open';
  end if;

  insert into public.game_sessions (couple_id, game_id, status, created_by, players, options)
  values (cid, p_game_id, 'waiting', p_user, array[p_user], coalesce(p_options, '{}'::jsonb))
  returning * into created;
  return created;
end;
$$;

-- The partner joins a waiting session (idempotent for someone already in it).
create function public.game_join_session(p_user uuid, p_session uuid)
returns public.game_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.game_sessions := private.game_lock_session(p_user, p_session);
begin
  if p_user = any (s.players) then
    return s;
  end if;
  if s.status not in ('waiting', 'ready') then
    raise exception 'game:not_joinable';
  end if;
  if cardinality(s.players) >= 2 then
    raise exception 'game:full';
  end if;
  update public.game_sessions g set players = array_append(g.players, p_user) where g.id = s.id returning * into s;
  return s;
end;
$$;

-- Ready / not ready. Both players ready → status 'ready' (the server then starts it).
create function public.game_set_ready(p_user uuid, p_session uuid, p_ready boolean)
returns public.game_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.game_sessions := private.game_lock_session(p_user, p_session);
  next_ready uuid[];
begin
  if not (p_user = any (s.players)) then
    raise exception 'game:not_a_player';
  end if;
  if s.status not in ('waiting', 'ready') then
    raise exception 'game:not_joinable';
  end if;
  perform private.game_rate_hit(p_user, 'ready', 30, interval '1 minute');
  next_ready := array_remove(s.ready, p_user);
  if p_ready then
    next_ready := array_append(next_ready, p_user);
  end if;
  update public.game_sessions g
     set ready = next_ready,
         status = case when cardinality(g.players) = 2 and cardinality(next_ready) = 2 then 'ready' else 'waiting' end
   where g.id = s.id
  returning * into s;
  return s;
end;
$$;

-- ready → active with the initial state the server's engine produced.
-- Returns null when the session was already started (concurrent ready clicks).
create function public.game_start_session(p_session uuid, p_state jsonb, p_seed bigint)
returns public.game_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.game_sessions;
begin
  update public.game_sessions g
     set status = 'active', state = p_state, seed = p_seed, state_version = 1, started_at = now()
   where g.id = p_session and g.status = 'ready' and cardinality(g.players) = 2 and cardinality(g.ready) = 2
  returning * into s;
  if not found then
    return null;
  end if;
  return s;
end;
$$;

-- Records a validated action's outcome (optimistic concurrency on state_version).
-- Only the server's engine produces p_state/p_result; nothing here comes from a client.
create function public.game_commit_state(
  p_session uuid,
  p_expected_version integer,
  p_state jsonb,
  p_status text,
  p_result jsonb default null,
  p_winner uuid default null,
  p_streak_eligible boolean default false
)
returns public.game_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.game_sessions;
begin
  if p_status not in ('active', 'completed') then
    raise exception 'game:invalid_transition';
  end if;
  update public.game_sessions g
     set state = p_state,
         state_version = g.state_version + 1,
         status = p_status,
         result = case when p_status = 'completed' then p_result else g.result end,
         winner_id = case when p_status = 'completed' then p_winner else null end,
         streak_eligible = (p_status = 'completed' and p_streak_eligible and p_winner is not null),
         finished_at = case when p_status = 'completed' then now() else null end
   where g.id = p_session and g.status = 'active' and g.state_version = p_expected_version
  returning * into s;
  if not found then
    raise exception 'game:conflict';
  end if;
  return s;
end;
$$;

-- Counts one action toward the per-user action rate limit (invalid-action spam included).
create function public.game_note_action(p_user uuid, p_session uuid)
returns public.game_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.game_sessions;
begin
  select * into s from public.game_sessions g
   where g.id = p_session and g.couple_id = private.game_user_couple(p_user);
  if not found then
    raise exception 'game:not_found';
  end if;
  if not (p_user = any (s.players)) then
    raise exception 'game:not_a_player';
  end if;
  perform private.game_rate_hit(p_user, 'action', 40, interval '10 seconds');
  return s;
end;
$$;

-- Leaving: before the start the session is cancelled; during play it's abandoned
-- (abandoned sessions never count toward win streaks).
create function public.game_leave_session(p_user uuid, p_session uuid)
returns public.game_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.game_sessions := private.game_lock_session(p_user, p_session);
begin
  if not (p_user = any (s.players)) and s.created_by <> p_user then
    raise exception 'game:not_a_player';
  end if;
  if s.status in ('completed', 'abandoned', 'cancelled') then
    return s;
  end if;
  update public.game_sessions g
     set status = case when g.status in ('active', 'paused') then 'abandoned' else 'cancelled' end,
         result = case when g.status in ('active', 'paused')
                       then jsonb_build_object('outcome', 'abandoned', 'winnerId', null, 'scores', null,
                                               'summary', jsonb_build_object('reason', 'left', 'by', p_user))
                       else null end,
         winner_id = null,
         streak_eligible = false,
         finished_at = now()
   where g.id = s.id
  returning * into s;
  return s;
end;
$$;

-- ── Live sync ───────────────────────────────────────────────────────────────
create function private.broadcast_game_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
begin
  kind := case
    when tg_op = 'INSERT' then 'created'
    when old.status is distinct from new.status then new.status
    when old.players is distinct from new.players then 'joined'
    when old.ready is distinct from new.ready then 'ready'
    when old.state_version is distinct from new.state_version then 'state'
    else 'updated'
  end;
  begin
    perform realtime.send(
      jsonb_build_object(
        'event', kind,
        'id', new.id,
        'gameId', new.game_id,
        'status', new.status,
        'players', to_jsonb(new.players),
        'ready', to_jsonb(new.ready),
        'version', new.state_version,
        'createdBy', new.created_by
      ),
      'session',
      'our-place:couple:' || new.couple_id::text || ':games',
      true
    );
  exception when others then
    null; -- delivery is best-effort; clients re-fetch on reconnect
  end;
  return null;
end;
$$;

create trigger broadcast_game_session
  after insert or update on public.game_sessions
  for each row execute function private.broadcast_game_session();

-- ── Privileges: the game functions are for the server only ──────────────────
revoke all on function public.game_create_session(uuid, text, jsonb), public.game_join_session(uuid, uuid),
  public.game_set_ready(uuid, uuid, boolean), public.game_start_session(uuid, jsonb, bigint),
  public.game_commit_state(uuid, integer, jsonb, text, jsonb, uuid, boolean), public.game_note_action(uuid, uuid),
  public.game_leave_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.game_create_session(uuid, text, jsonb), public.game_join_session(uuid, uuid),
  public.game_set_ready(uuid, uuid, boolean), public.game_start_session(uuid, jsonb, bigint),
  public.game_commit_state(uuid, integer, jsonb, text, jsonb, uuid, boolean), public.game_note_action(uuid, uuid),
  public.game_leave_session(uuid, uuid)
  to service_role;
revoke all on function private.game_rate_hit(uuid, text, integer, interval), private.game_user_couple(uuid),
  private.game_lock_session(uuid, uuid), private.broadcast_game_session()
  from public, anon, authenticated;
grant select, insert, update on public.game_sessions to service_role;
