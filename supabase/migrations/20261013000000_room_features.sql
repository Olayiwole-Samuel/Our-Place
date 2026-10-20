-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — the room comes alive (2026-10-20)
--
--   couple_visits        each partner's days in Our Place → "last here …" and
--                        the together streak (days you were BOTH here)
--   couple_notes         notes on the message board
--   couple_memories      photos on the memory wall (private bucket)
--   couple_videos        movies and clips uploaded for the TV (files live in
--                        Backblaze B2; only the server writes these rows)
--   couple_watch         what the TV is playing right now, kept in sync
--   push_subscriptions   phone/browser push endpoints (server-only)
--
-- As everywhere in Our Place, the couple is ALWAYS derived from auth.uid()
-- (private.current_couple_id()); clients never send a couple id. Clients read
-- their couple's rows under RLS and write through security-definer functions
-- (or the server). Changes are announced on the couple's private `lobby` topic
-- so both screens refresh at once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Shared: announce a room change on the couple's lobby topic ─────────────
create function private.broadcast_room_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_couple uuid := coalesce(new.couple_id, old.couple_id);
begin
  begin
    perform realtime.send(
      jsonb_build_object('area', tg_argv[0], 'op', lower(tg_op)),
      'room',
      'our-place:couple:' || row_couple::text || ':lobby',
      true
    );
  exception when others then
    null; -- best effort: clients also refresh when they open a panel
  end;
  return null;
end;
$$;
revoke all on function private.broadcast_room_change() from public, anon, authenticated;

-- ── Visits: last seen + the together streak ────────────────────────────────
create table public.couple_visits (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (couple_id, user_id, day)
);
comment on table public.couple_visits is 'One row per partner per local day in Our Place. Written by note_presence() only.';
create index couple_visits_couple_day on public.couple_visits (couple_id, day desc);

alter table public.couple_visits enable row level security;
create policy "couple members read their couple's visits"
  on public.couple_visits for select to authenticated
  using (couple_id = private.current_couple_id());
revoke all on public.couple_visits from anon, authenticated;
grant select on public.couple_visits to authenticated;
grant select on public.couple_visits to service_role;

-- Called on arrival, every couple of minutes while in the room, and on leaving.
-- `tz` is the device's IANA time zone (e.g. Africa/Lagos); an unknown one falls back to Lagos.
-- Returns the server's clock, so screens can line up watch-together playback.
create function public.note_presence(tz text default 'Africa/Lagos')
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  zone text := coalesce(nullif(tz, ''), 'Africa/Lagos');
  today date;
begin
  if uid is null or cid is null then
    raise exception 'room:not_paired';
  end if;
  begin
    today := (now() at time zone zone)::date;
  exception when others then
    today := (now() at time zone 'Africa/Lagos')::date;
  end;
  insert into public.couple_visits (couple_id, user_id, day)
  values (cid, uid, today)
  on conflict (couple_id, user_id, day) do update set last_at = now();
  return now();
end;
$$;

-- The together streak: consecutive days on which BOTH partners visited, ending
-- today or yesterday (today isn't over yet), plus the best run ever.
create function public.couple_streak()
returns table (current_days integer, best_days integer, today_both boolean, last_both date)
language sql
stable
security definer
set search_path = ''
as $$
  with both_days as (
    select v.day
    from public.couple_visits v
    where v.couple_id = private.current_couple_id()
    group by v.day
    having count(distinct v.user_id) = 2
  ),
  runs as (
    select day, day - (row_number() over (order by day))::integer as run_key from both_days
  ),
  islands as (
    select min(day) as started, max(day) as ended, count(*)::integer as length from runs group by run_key
  ),
  latest as (select max(day) as day from both_days)
  select
    coalesce((
      select i.length from islands i
      where i.ended >= (select max(v.day) from public.couple_visits v where v.couple_id = private.current_couple_id()) - 1
      order by i.ended desc limit 1
    ), 0) as current_days,
    coalesce((select max(i.length) from islands i), 0) as best_days,
    coalesce((select l.day = (select max(v.day) from public.couple_visits v where v.couple_id = private.current_couple_id()) from latest l), false) as today_both,
    (select l.day from latest l) as last_both;
$$;
comment on function public.couple_streak() is
  'Together streak for the caller''s couple: days in a row both partners visited (today or yesterday must be one of them).';

-- ── Notes on the message board ──────────────────────────────────────────────
create table public.couple_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  color text not null default 'yellow' check (color in ('yellow', 'pink', 'green', 'blue')),
  created_at timestamptz not null default now(),
  seen_at timestamptz -- when the partner first saw it
);
create index couple_notes_couple_created on public.couple_notes (couple_id, created_at desc);

alter table public.couple_notes enable row level security;
create policy "couple members read their couple's notes"
  on public.couple_notes for select to authenticated
  using (couple_id = private.current_couple_id());
revoke all on public.couple_notes from anon, authenticated;
grant select on public.couple_notes to authenticated;
grant select, insert, update, delete on public.couple_notes to service_role;

create function public.add_note(body text, color text default 'yellow')
returns public.couple_notes
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  clean text := btrim(regexp_replace(coalesce(body, ''), E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', '', 'g'), E' \t\r\n');
  inserted public.couple_notes;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if clean = '' then raise exception 'room:empty'; end if;
  if char_length(clean) > 500 then raise exception 'room:too_long'; end if;
  if color not in ('yellow', 'pink', 'green', 'blue') then raise exception 'room:invalid'; end if;
  if (select count(*) from public.couple_notes n where n.author_id = uid and n.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'room:rate_limited';
  end if;
  insert into public.couple_notes (couple_id, author_id, body, color) values (cid, uid, clean, add_note.color) returning * into inserted;
  return inserted;
end;
$$;

-- Only the author removes a note.
create function public.delete_note(note_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.couple_notes n
  where n.id = note_id and n.author_id = (select auth.uid()) and n.couple_id = private.current_couple_id();
end;
$$;

-- Marks the partner's notes as seen (opening the board).
create function public.mark_notes_seen()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.couple_notes n set seen_at = now()
  where n.couple_id = private.current_couple_id() and n.author_id <> (select auth.uid()) and n.seen_at is null;
end;
$$;

create trigger broadcast_note_change after insert or delete on public.couple_notes
  for each row execute function private.broadcast_room_change('notes');

-- ── Memories (photo wall) ───────────────────────────────────────────────────
create table public.couple_memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  uploader_id uuid not null references public.users (id) on delete cascade,
  path text not null check (path ~ '^[0-9a-f-]{36}/[a-z0-9_-]{1,80}\.(jpg|png|webp)$'),
  caption text not null default '' check (char_length(caption) <= 200),
  taken_on date,
  created_at timestamptz not null default now(),
  constraint couple_memories_path_in_couple_folder check (split_part(path, '/', 1) = couple_id::text)
);
create index couple_memories_couple_created on public.couple_memories (couple_id, created_at desc);

alter table public.couple_memories enable row level security;
create policy "couple members read their couple's memories"
  on public.couple_memories for select to authenticated
  using (couple_id = private.current_couple_id());
revoke all on public.couple_memories from anon, authenticated;
grant select on public.couple_memories to authenticated;
grant select, insert, update, delete on public.couple_memories to service_role;

create trigger broadcast_memory_change after insert or update or delete on public.couple_memories
  for each row execute function private.broadcast_room_change('memories');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('couple-memories', 'couple-memories', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "couple memories: members of the couple can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'couple-memories' and (storage.foldername(name))[1] = private.current_couple_id()::text);

-- ── Videos for the TV (files in Backblaze B2; rows written by the server) ───
create table public.couple_videos (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  uploader_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('movie', 'clip')),
  title text not null check (char_length(title) between 1 and 120),
  object_key text not null unique check (split_part(object_key, '/', 1) = couple_id::text),
  size_bytes bigint not null check (size_bytes > 0),
  content_type text not null,
  status text not null default 'uploading' check (status in ('uploading', 'ready')),
  created_at timestamptz not null default now()
);
create index couple_videos_couple_created on public.couple_videos (couple_id, created_at desc);

alter table public.couple_videos enable row level security;
create policy "couple members read their couple's videos"
  on public.couple_videos for select to authenticated
  using (couple_id = private.current_couple_id());
revoke all on public.couple_videos from anon, authenticated;
grant select (id, couple_id, uploader_id, kind, title, size_bytes, content_type, status, created_at) on public.couple_videos to authenticated;
grant select, insert, update, delete on public.couple_videos to service_role;

create trigger broadcast_video_change after insert or update or delete on public.couple_videos
  for each row execute function private.broadcast_room_change('videos');

-- ── What's on the TV (one row per couple, kept in sync) ─────────────────────
create table public.couple_watch (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  source jsonb, -- { "type": "youtube", "id": "<11 chars>", "title" } | { "type": "video", "id": "<uuid>", "title" } | null
  playing boolean not null default false,
  at_seconds double precision not null default 0 check (at_seconds >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  version bigint not null default 0
);

alter table public.couple_watch enable row level security;
create policy "couple members read their couple's TV"
  on public.couple_watch for select to authenticated
  using (couple_id = private.current_couple_id());
revoke all on public.couple_watch from anon, authenticated;
grant select on public.couple_watch to authenticated;
grant select on public.couple_watch to service_role;

-- Start / play / pause / seek / stop. The server clock stamps every change, so
-- both players compute the same moment (at_seconds + elapsed while playing).
create function public.set_watch(source jsonb, playing boolean, at_seconds double precision)
returns public.couple_watch
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  kind text := source ->> 'type';
  saved public.couple_watch;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if source is not null then
    if kind = 'youtube' then
      if coalesce(source ->> 'id', '') !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'room:invalid'; end if;
    elsif kind = 'video' then
      if not exists (select 1 from public.couple_videos v where v.id::text = source ->> 'id' and v.couple_id = cid and v.status = 'ready') then
        raise exception 'room:invalid';
      end if;
    else
      raise exception 'room:invalid';
    end if;
    if char_length(coalesce(source ->> 'title', '')) > 200 then raise exception 'room:invalid'; end if;
    source := jsonb_build_object('type', kind, 'id', source ->> 'id', 'title', coalesce(source ->> 'title', ''));
  end if;
  if at_seconds is null or at_seconds < 0 or at_seconds > 1e6 then raise exception 'room:invalid'; end if;
  insert into public.couple_watch as w (couple_id, source, playing, at_seconds, updated_at, updated_by, version)
  values (cid, set_watch.source, coalesce(set_watch.playing, false) and set_watch.source is not null, set_watch.at_seconds, now(), uid, 1)
  on conflict (couple_id) do update set
    source = excluded.source, playing = excluded.playing, at_seconds = excluded.at_seconds,
    updated_at = now(), updated_by = uid, version = w.version + 1
  returning * into saved;
  return saved;
end;
$$;

create function private.broadcast_watch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('area', 'watch', 'source', new.source, 'playing', new.playing, 'at_seconds', new.at_seconds,
                         'updated_at', new.updated_at, 'updated_by', new.updated_by, 'version', new.version),
      'room',
      'our-place:couple:' || new.couple_id::text || ':lobby',
      true
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke all on function private.broadcast_watch() from public, anon, authenticated;
create trigger broadcast_watch after insert or update on public.couple_watch
  for each row execute function private.broadcast_watch();

-- ── Push subscriptions (server only) ────────────────────────────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

-- Throttle for pushes (arrival / message), per recipient and kind. Server only.
create table public.push_log (
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;
grant select, insert, update, delete on public.push_log to service_role;

-- ── Trophies (bookshelf): everything counted for the caller's couple ────────
create function public.couple_trophies()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'paired_at', (select c.paired_at from public.couples c where c.id = private.current_couple_id()),
    'games_played', (select count(*) from public.game_sessions g where g.couple_id = private.current_couple_id() and g.status = 'completed'),
    'wins', coalesce((
      select jsonb_agg(jsonb_build_object('game_id', w.game_id, 'user_id', w.winner_id, 'wins', w.wins))
      from (
        select g.game_id, g.winner_id, count(*) as wins
        from public.game_sessions g
        where g.couple_id = private.current_couple_id() and g.status = 'completed' and g.winner_id is not null
        group by g.game_id, g.winner_id
      ) w
    ), '[]'::jsonb),
    'best_streaks', coalesce((
      select jsonb_agg(jsonb_build_object('game_id', s.game_id, 'user_id', s.user_id, 'best', s.best))
      from public.win_streaks s where s.couple_id = private.current_couple_id() and s.best > 0
    ), '[]'::jsonb),
    'puzzles_done', (select count(*) from public.game_sessions g where g.couple_id = private.current_couple_id() and g.status = 'completed' and g.game_id = 'jigsaw_puzzle'),
    'messages', (select count(*) from public.messages m where m.couple_id = private.current_couple_id()),
    'memories', (select count(*) from public.couple_memories m where m.couple_id = private.current_couple_id()),
    'notes', (select count(*) from public.couple_notes n where n.couple_id = private.current_couple_id()),
    'days_together_here', (select count(*) from (
      select v.day from public.couple_visits v where v.couple_id = private.current_couple_id() group by v.day having count(distinct v.user_id) = 2
    ) d)
  );
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on function public.note_presence(text), public.couple_streak(), public.add_note(text, text), public.delete_note(uuid),
  public.mark_notes_seen(), public.set_watch(jsonb, boolean, double precision), public.couple_trophies() from public, anon;
grant execute on function public.note_presence(text), public.couple_streak(), public.add_note(text, text), public.delete_note(uuid),
  public.mark_notes_seen(), public.set_watch(jsonb, boolean, double precision), public.couple_trophies() to authenticated;
