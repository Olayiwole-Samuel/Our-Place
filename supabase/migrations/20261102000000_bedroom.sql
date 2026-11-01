-- ─────────────────────────────────────────────────────────────────────────────
-- The bedroom: sleep sounds you both hear (with a sleep timer), the goodnight
-- ritual (who said goodnight first tonight, and a little note), and the wish
-- jar for the shooting stars.
--
--   couple_bedroom    one row per couple: the sleep sound and its timer,
--                     stamped by the database clock (like the TV)
--   couple_goodnights one row per person per night (a night runs noon → noon,
--                     Lagos time, so 1 a.m. still counts as tonight)
--   couple_wishes     wishes made on a shooting star. A wish is secret: only its
--                     maker reads the words (wish_jar()); the partner sees that
--                     a wish was made — unless the maker shares it.
--
-- Written through the functions below; announced on the couple's lobby topic,
-- areas "bedroom", "goodnight", "wishes".
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Sleep sounds ────────────────────────────────────────────────────────────
create table public.couple_bedroom (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  sound text check (sound is null or sound in ('rain', 'ocean', 'fire', 'night', 'lullaby')),
  started_at timestamptz,
  minutes integer check (minutes is null or minutes between 5 and 480),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.couple_bedroom enable row level security;
create policy "bedroom: the couple reads it" on public.couple_bedroom for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_bedroom from anon, authenticated;
grant select on public.couple_bedroom to authenticated;
grant select on public.couple_bedroom to service_role;
create trigger broadcast_bedroom_change after insert or update on public.couple_bedroom
  for each row execute function private.broadcast_room_change('bedroom');

/** Start a sleep sound for both of you (null stops it); `minutes` = sleep timer (null = until stopped). */
create function public.set_sleep_sound(sound text, minutes integer default null)
returns public.couple_bedroom
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  saved public.couple_bedroom;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if set_sleep_sound.sound is not null and set_sleep_sound.sound not in ('rain', 'ocean', 'fire', 'night', 'lullaby') then raise exception 'room:invalid'; end if;
  if set_sleep_sound.minutes is not null and set_sleep_sound.minutes not between 5 and 480 then raise exception 'room:invalid'; end if;
  insert into public.couple_bedroom as b (couple_id, sound, started_at, minutes, updated_by, updated_at)
  values (cid, set_sleep_sound.sound, case when set_sleep_sound.sound is null then null else now() end, set_sleep_sound.minutes, uid, now())
  on conflict (couple_id) do update set
    sound = excluded.sound, started_at = excluded.started_at, minutes = excluded.minutes, updated_by = uid, updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

-- ── Goodnight ───────────────────────────────────────────────────────────────
create table public.couple_goodnights (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  night date not null,
  said_at timestamptz not null default now(),
  note text check (note is null or char_length(note) between 1 and 140),
  primary key (user_id, night)
);
create index couple_goodnights_couple_night on public.couple_goodnights (couple_id, night desc);
alter table public.couple_goodnights enable row level security;
create policy "goodnights: the couple reads them" on public.couple_goodnights for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_goodnights from anon, authenticated;
grant select on public.couple_goodnights to authenticated;
grant select on public.couple_goodnights to service_role;
create trigger broadcast_goodnight_change after insert or update on public.couple_goodnights
  for each row execute function private.broadcast_room_change('goodnight');

/** The night a moment belongs to: noon → noon in Lagos (so 1 a.m. is still "tonight"). */
create function private.night_of(at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((at at time zone 'Africa/Lagos') - interval '12 hours')::date;
$$;

/** Say goodnight (once a night; saying it again only updates the note). */
create function public.say_goodnight(note text default null)
returns public.couple_goodnights
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  clean text := nullif(btrim(regexp_replace(regexp_replace(coalesce(say_goodnight.note, ''), E'[\\x01-\\x1F\\x7F]', '', 'g'), E'\\s+', ' ', 'g')), '');
  saved public.couple_goodnights;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if char_length(clean) > 140 then raise exception 'room:invalid'; end if;
  insert into public.couple_goodnights as g (couple_id, user_id, night, note)
  values (cid, uid, private.night_of(now()), clean)
  on conflict (user_id, night) do update set note = coalesce(excluded.note, g.note)
  returning * into saved;
  return saved;
end;
$$;

-- ── Wishes ──────────────────────────────────────────────────────────────────
create table public.couple_wishes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  wish text not null check (char_length(wish) between 1 and 200),
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index couple_wishes_couple_created on public.couple_wishes (couple_id, created_at desc);
alter table public.couple_wishes enable row level security;
-- No direct reads: wish_jar() hides your partner's words unless they shared them.
revoke all on public.couple_wishes from anon, authenticated;
grant select, insert, update, delete on public.couple_wishes to service_role;
create trigger broadcast_wish_change after insert or update or delete on public.couple_wishes
  for each row execute function private.broadcast_room_change('wishes');

create function public.make_wish(wish text, shared boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  clean text := btrim(regexp_replace(regexp_replace(coalesce(make_wish.wish, ''), E'[\\x01-\\x1F\\x7F]', '', 'g'), E'\\s+', ' ', 'g'));
  made uuid;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if char_length(clean) not between 1 and 200 then raise exception 'room:invalid'; end if;
  -- One wish every 20 seconds is plenty (a shooting star is only so long).
  if exists (select 1 from public.couple_wishes w where w.user_id = uid and w.created_at > now() - interval '20 seconds') then raise exception 'room:rate_limited'; end if;
  insert into public.couple_wishes (couple_id, user_id, wish, shared) values (cid, uid, clean, coalesce(make_wish.shared, false)) returning id into made;
  return made;
end;
$$;

/** Share (or hide again) one of your wishes; or delete it (remove = true). */
create function public.update_wish(wish_id uuid, shared boolean default null, remove boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'room:not_paired'; end if;
  if update_wish.remove then
    delete from public.couple_wishes w where w.id = update_wish.wish_id and w.user_id = uid;
  elsif update_wish.shared is not null then
    update public.couple_wishes w set shared = update_wish.shared where w.id = update_wish.wish_id and w.user_id = uid;
  end if;
end;
$$;

/** The wish jar: your wishes (words), your partner's (words only if they shared). */
create function public.wish_jar()
returns table (id uuid, user_id uuid, wish text, shared boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.user_id,
         case when w.user_id = (select auth.uid()) or w.shared then w.wish else null end,
         w.shared, w.created_at
  from public.couple_wishes w
  where w.couple_id = private.current_couple_id()
  order by w.created_at desc
  limit 300;
$$;

revoke all on function public.set_sleep_sound(text, integer), public.say_goodnight(text), public.make_wish(text, boolean),
  public.update_wish(uuid, boolean, boolean), public.wish_jar() from public, anon;
grant execute on function public.set_sleep_sound(text, integer), public.say_goodnight(text), public.make_wish(text, boolean),
  public.update_wish(uuid, boolean, boolean), public.wish_jar() to authenticated;
revoke all on function private.night_of(timestamptz) from public, anon, authenticated;
