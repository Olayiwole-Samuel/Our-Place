-- ─────────────────────────────────────────────────────────────────────────────
-- Music: songs you've added (picked on Spotify, played from YouTube for both
-- of you), shared playlists, ONE shared player per couple (synced like the TV:
-- stamped by the database clock), "our song", and the Spotify sign-in of
-- whichever of you connected it (tokens readable by the server only).
--
-- Clients write through the security-definer functions below; everything is
-- announced on the couple's lobby topic (areas "music", "tracks", "playlists",
-- "spotify").
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Songs ───────────────────────────────────────────────────────────────────
create table public.couple_tracks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  spotify_id text check (spotify_id ~ '^[A-Za-z0-9]{10,40}$'),
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'), -- null until matched (the first time it's played)
  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '' check (char_length(artist) <= 200),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 500)),
  duration_s integer check (duration_s is null or duration_s between 1 and 36000),
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint couple_tracks_has_source check (spotify_id is not null or youtube_id is not null)
);
create unique index couple_tracks_spotify on public.couple_tracks (couple_id, spotify_id) where spotify_id is not null;
create unique index couple_tracks_youtube_only on public.couple_tracks (couple_id, youtube_id) where spotify_id is null;
create index couple_tracks_couple_created on public.couple_tracks (couple_id, created_at desc);
alter table public.couple_tracks enable row level security;
create policy "tracks: the couple reads its songs" on public.couple_tracks for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_tracks from anon, authenticated;
grant select on public.couple_tracks to authenticated;
grant select, insert, update, delete on public.couple_tracks to service_role;
create trigger broadcast_track_change after insert or update or delete on public.couple_tracks
  for each row execute function private.broadcast_room_change('tracks');

/**
 * Add a song (or get the one you already have). From Spotify: spotify_id with
 * title/artist/art/duration (the server matches it to YouTube when it first
 * plays). From a YouTube link: youtube_id and its title.
 */
create function public.add_track(spotify_id text, youtube_id text, title text, artist text default '', image_url text default null, duration_s integer default null)
returns public.couple_tracks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  saved public.couple_tracks;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if add_track.spotify_id is null and add_track.youtube_id is null then raise exception 'room:invalid'; end if;
  if add_track.spotify_id is not null then
    select * into saved from public.couple_tracks t where t.couple_id = cid and t.spotify_id = add_track.spotify_id;
  else
    select * into saved from public.couple_tracks t where t.couple_id = cid and t.spotify_id is null and t.youtube_id = add_track.youtube_id;
  end if;
  if found then return saved; end if;
  if (select count(*) from public.couple_tracks t where t.couple_id = cid) >= 5000 then raise exception 'room:too_many'; end if;
  insert into public.couple_tracks (couple_id, spotify_id, youtube_id, title, artist, image_url, duration_s, added_by)
  values (cid, add_track.spotify_id, add_track.youtube_id, btrim(add_track.title), btrim(coalesce(add_track.artist, '')), add_track.image_url, add_track.duration_s, uid)
  returning * into saved;
  return saved;
exception when check_violation or not_null_violation then
  raise exception 'room:invalid';
end;
$$;
revoke all on function public.add_track(text, text, text, text, text, integer) from public, anon;
grant execute on function public.add_track(text, text, text, text, text, integer) to authenticated;

/** Remove a song from your library (and from every playlist and the queue). */
create function public.remove_track(track_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cid uuid := private.current_couple_id();
begin
  if (select auth.uid()) is null or cid is null then raise exception 'room:not_paired'; end if;
  update public.couple_music m set queue = array_remove(m.queue, remove_track.track_id) where m.couple_id = cid;
  delete from public.couple_tracks t where t.id = remove_track.track_id and t.couple_id = cid;
end;
$$;

-- ── Playlists ───────────────────────────────────────────────────────────────
create table public.couple_playlists (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.couple_playlist_tracks (
  playlist_id uuid not null references public.couple_playlists (id) on delete cascade,
  track_id uuid not null references public.couple_tracks (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  position double precision not null,
  added_by uuid references public.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (playlist_id, track_id)
);
create index couple_playlist_tracks_order on public.couple_playlist_tracks (playlist_id, position);
alter table public.couple_playlists enable row level security;
alter table public.couple_playlist_tracks enable row level security;
create policy "playlists: the couple reads them" on public.couple_playlists for select to authenticated using (couple_id = private.current_couple_id());
create policy "playlist tracks: the couple reads them" on public.couple_playlist_tracks for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_playlists, public.couple_playlist_tracks from anon, authenticated;
grant select on public.couple_playlists, public.couple_playlist_tracks to authenticated;
grant select, insert, update, delete on public.couple_playlists, public.couple_playlist_tracks to service_role;
create trigger broadcast_playlist_change after insert or update or delete on public.couple_playlists
  for each row execute function private.broadcast_room_change('playlists');
create trigger broadcast_playlist_track_change after insert or update or delete on public.couple_playlist_tracks
  for each row execute function private.broadcast_room_change('playlists');

/** Create, rename (id given) or delete (name null) a playlist. Returns its id. */
create function public.save_playlist(playlist_id uuid, name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  clean text := btrim(regexp_replace(coalesce(save_playlist.name, ''), E'\\s+', ' ', 'g'));
  saved uuid;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if save_playlist.playlist_id is not null and save_playlist.name is null then
    delete from public.couple_playlists p where p.id = save_playlist.playlist_id and p.couple_id = cid;
    return save_playlist.playlist_id;
  end if;
  if char_length(clean) not between 1 and 60 then raise exception 'room:invalid'; end if;
  if save_playlist.playlist_id is null then
    if (select count(*) from public.couple_playlists p where p.couple_id = cid) >= 100 then raise exception 'room:too_many'; end if;
    insert into public.couple_playlists (couple_id, name, created_by) values (cid, clean, uid) returning id into saved;
  else
    update public.couple_playlists p set name = clean where p.id = save_playlist.playlist_id and p.couple_id = cid returning id into saved;
    if saved is null then raise exception 'room:invalid'; end if;
  end if;
  return saved;
end;
$$;

/** Add songs to a playlist (at the end, in order; ones already there stay put) or remove one. */
create function public.playlist_tracks(playlist_id uuid, add uuid[] default null, remove uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  last_position double precision;
  track uuid;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if not exists (select 1 from public.couple_playlists p where p.id = playlist_tracks.playlist_id and p.couple_id = cid) then raise exception 'room:invalid'; end if;
  if playlist_tracks.remove is not null then
    delete from public.couple_playlist_tracks x where x.playlist_id = playlist_tracks.playlist_id and x.track_id = playlist_tracks.remove;
  end if;
  if playlist_tracks.add is not null then
    if cardinality(playlist_tracks.add) > 500 then raise exception 'room:invalid'; end if;
    select coalesce(max(x.position), 0) into last_position from public.couple_playlist_tracks x where x.playlist_id = playlist_tracks.playlist_id;
    foreach track in array playlist_tracks.add loop
      if not exists (select 1 from public.couple_tracks t where t.id = track and t.couple_id = cid) then raise exception 'room:invalid'; end if;
      last_position := last_position + 1;
      insert into public.couple_playlist_tracks (playlist_id, track_id, couple_id, position, added_by)
      values (playlist_tracks.playlist_id, track, cid, last_position, uid)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

-- ── The shared player ──────────────────────────────────────────────────────
create table public.couple_music (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  queue uuid[] not null default '{}', -- track ids, in play order
  position integer not null default 0, -- which of the queue is on
  playing boolean not null default false,
  at_seconds double precision not null default 0 check (at_seconds >= 0),
  shuffle boolean not null default false,
  repeat text not null default 'all' check (repeat in ('off', 'all', 'one')),
  playlist_id uuid references public.couple_playlists (id) on delete set null, -- what the queue came from
  our_song uuid references public.couple_tracks (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  version bigint not null default 0
);
alter table public.couple_music enable row level security;
create policy "music: the couple reads its player" on public.couple_music for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_music from anon, authenticated;
grant select on public.couple_music to authenticated;
grant select on public.couple_music to service_role;
create trigger broadcast_music_change after insert or update on public.couple_music
  for each row execute function private.broadcast_room_change('music');

/**
 * Play / pause / seek / skip / change the queue. The server clock stamps every
 * change, so both screens compute the same moment (at_seconds + time since).
 * Every queued track must be one of yours.
 */
create function public.set_music(queue uuid[], "position" integer, playing boolean, at_seconds double precision, shuffle boolean default false, repeat text default 'all', playlist_id uuid default null)
returns public.couple_music
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  saved public.couple_music;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if set_music.queue is null or cardinality(set_music.queue) > 1000 then raise exception 'room:invalid'; end if;
  if exists (select 1 from unnest(set_music.queue) q (id) where not exists (select 1 from public.couple_tracks t where t.id = q.id and t.couple_id = cid)) then
    raise exception 'room:invalid';
  end if;
  if set_music."position" is null or set_music."position" < 0 or (cardinality(set_music.queue) > 0 and set_music."position" >= cardinality(set_music.queue)) then raise exception 'room:invalid'; end if;
  if set_music.at_seconds is null or set_music.at_seconds < 0 or set_music.at_seconds > 36000 then raise exception 'room:invalid'; end if;
  if set_music.repeat not in ('off', 'all', 'one') then raise exception 'room:invalid'; end if;
  if set_music.playlist_id is not null and not exists (select 1 from public.couple_playlists p where p.id = set_music.playlist_id and p.couple_id = cid) then raise exception 'room:invalid'; end if;
  insert into public.couple_music as m (couple_id, queue, position, playing, at_seconds, shuffle, repeat, playlist_id, updated_at, updated_by, version)
  values (cid, set_music.queue, set_music."position", coalesce(set_music.playing, false) and cardinality(set_music.queue) > 0, set_music.at_seconds, coalesce(set_music.shuffle, false), set_music.repeat, set_music.playlist_id, now(), uid, 1)
  on conflict (couple_id) do update set
    queue = excluded.queue, position = excluded.position, playing = excluded.playing, at_seconds = excluded.at_seconds,
    shuffle = excluded.shuffle, repeat = excluded.repeat, playlist_id = excluded.playlist_id,
    updated_at = now(), updated_by = uid, version = m.version + 1
  returning * into saved;
  return saved;
end;
$$;

/** Mark a song as "our song" ❤️ (null clears it). */
create function public.set_our_song(track_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if set_our_song.track_id is not null and not exists (select 1 from public.couple_tracks t where t.id = set_our_song.track_id and t.couple_id = cid) then raise exception 'room:invalid'; end if;
  insert into public.couple_music as m (couple_id, our_song, updated_by)
  values (cid, set_our_song.track_id, uid)
  on conflict (couple_id) do update set our_song = excluded.our_song;
end;
$$;

-- ── Spotify (one of you connects; the server keeps the tokens) ──────────────
create table public.couple_spotify (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  display_name text,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  connected_at timestamptz not null default now()
);
alter table public.couple_spotify enable row level security;
revoke all on public.couple_spotify from anon, authenticated;
grant select, insert, update, delete on public.couple_spotify to service_role;
create trigger broadcast_spotify_change after insert or update or delete on public.couple_spotify
  for each row execute function private.broadcast_room_change('spotify');

/** Whether Spotify is connected, and by whom — never the tokens. */
create function public.spotify_status()
returns table (connected boolean, user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select true, s.user_id, s.display_name from public.couple_spotify s where s.couple_id = private.current_couple_id();
$$;

revoke all on function public.remove_track(uuid), public.save_playlist(uuid, text), public.playlist_tracks(uuid, uuid[], uuid),
  public.set_music(uuid[], integer, boolean, double precision, boolean, text, uuid), public.set_our_song(uuid), public.spotify_status() from public, anon;
grant execute on function public.remove_track(uuid), public.save_playlist(uuid, text), public.playlist_tracks(uuid, uuid[], uuid),
  public.set_music(uuid[], integer, boolean, double precision, boolean, text, uuid), public.set_our_song(uuid), public.spotify_status() to authenticated;
