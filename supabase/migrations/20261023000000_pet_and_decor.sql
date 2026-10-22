-- ─────────────────────────────────────────────────────────────────────────────
-- Your dog and decorating the living room.
--
--   couple_pets     one dog per couple (a Maltese mix): its name, when it was
--                   last fed / petted / played with, and the latest thing either
--                   of you asked it to do (with when and where, so both screens
--                   play out the same moment).
--   couple_decor    furniture you placed: item, position, rotation.
--   couple_unlocks  items unlocked with hearts (for good).
--
-- Hearts are earned together and computed here (couple_hearts()); unlocking
-- spends them. Prices: private.decor_rule() — kept equal to lib/room/decor.js
-- by a test. Everything is read under RLS and written only through the
-- functions below. Changes are announced on the couple's lobby topic ("room").
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Catalogue rules: price in hearts and how many may be placed ─────────────
create function private.decor_rule(item text)
returns table (cost integer, max_count integer)
language sql
immutable
set search_path = ''
as $$
  select r.cost, r.max_count
  from (values
    ('dog_house', 0, 1), ('dog_bed', 0, 2), ('dog_bowl', 0, 2), ('dog_toys', 0, 2),
    ('round_rug', 0, 6), ('fluffy_rug', 60, 6), ('heart_rug', 120, 6),
    ('floor_cushions', 0, 6), ('bean_bag', 80, 6), ('armchair', 150, 6), ('loveseat', 250, 2),
    ('side_table', 60, 6), ('dinner_table', 200, 2),
    ('candles', 40, 6), ('lantern', 50, 6), ('warm_lamp', 80, 6),
    ('small_plant', 0, 6), ('cactus', 40, 6), ('flower_vase', 50, 6), ('monstera', 90, 6),
    ('teddy_bear', 70, 6), ('bookshelf_small', 100, 3), ('guitar', 120, 2), ('record_player', 180, 1), ('aquarium', 300, 1)
  ) as r (item, cost, max_count)
  where r.item = decor_rule.item;
$$;
revoke all on function private.decor_rule(text) from public, anon, authenticated;

-- ── The dog ─────────────────────────────────────────────────────────────────
create table public.couple_pets (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  kind text not null default 'maltese_mix',
  name text check (name is null or char_length(btrim(name)) between 1 and 24),
  fed_at timestamptz,
  petted_at timestamptz,
  played_at timestamptz,
  action text,
  action_at timestamptz,
  action_by uuid references public.users (id) on delete set null,
  action_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.couple_pets enable row level security;
create policy "pets: the couple reads its dog" on public.couple_pets for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_pets from anon, authenticated;
grant select on public.couple_pets to authenticated;
grant select, insert, update, delete on public.couple_pets to service_role;
create trigger broadcast_pet_change after insert or update on public.couple_pets
  for each row execute function private.broadcast_room_change('pet');

/**
 * Ask the dog to do something: pet | treat | feed | fetch | sit | lie | come | sleep.
 * `data` carries where it happens ({ start, to, from }: {x, z} points in the room),
 * worked out by the asking screen so both screens play the same thing.
 * Returns the dog's row (action_at is the server's clock).
 */
create function public.pet_do(action text, data jsonb default '{}'::jsonb)
returns public.couple_pets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  row public.couple_pets;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if action not in ('pet', 'treat', 'feed', 'fetch', 'sit', 'lie', 'come', 'sleep') then raise exception 'room:invalid'; end if;
  if data is null or jsonb_typeof(data) <> 'object' or char_length(data::text) > 400 then raise exception 'room:invalid'; end if;
  insert into public.couple_pets as p (couple_id) values (cid) on conflict (couple_id) do nothing;
  select * into row from public.couple_pets p where p.couple_id = cid for update;
  if row.action_at is not null and row.action_at > now() - interval '700 milliseconds' then raise exception 'room:rate_limited'; end if;
  update public.couple_pets p
  set action = pet_do.action,
      action_at = now(),
      action_by = uid,
      action_data = pet_do.data,
      fed_at = case when pet_do.action in ('feed', 'treat') then now() else p.fed_at end,
      petted_at = case when pet_do.action = 'pet' then now() else p.petted_at end,
      played_at = case when pet_do.action = 'fetch' then now() else p.played_at end,
      updated_at = now()
  where p.couple_id = cid
  returning * into row;
  return row;
end;
$$;

/** Name the dog (either of you, any time). */
create function public.name_pet(name text)
returns public.couple_pets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cid uuid := private.current_couple_id();
  clean text := btrim(regexp_replace(coalesce(name, ''), E'[\\x01-\\x1F\\x7F]', '', 'g'));
  row public.couple_pets;
begin
  if (select auth.uid()) is null or cid is null then raise exception 'room:not_paired'; end if;
  if char_length(clean) not between 1 and 24 then raise exception 'room:invalid'; end if;
  insert into public.couple_pets as p (couple_id, name) values (cid, clean)
  on conflict (couple_id) do update set name = excluded.name, updated_at = now()
  returning * into row;
  return row;
end;
$$;

-- ── Decorating ──────────────────────────────────────────────────────────────
create table public.couple_decor (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  item text not null,
  x double precision not null check (x between -4.5 and 4.5),
  z double precision not null check (z between -4 and 4),
  rotation double precision not null default 0 check (rotation between -7 and 7),
  placed_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index couple_decor_couple on public.couple_decor (couple_id);
alter table public.couple_decor enable row level security;
create policy "decor: the couple reads its room" on public.couple_decor for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_decor from anon, authenticated;
grant select on public.couple_decor to authenticated;
grant select, insert, update, delete on public.couple_decor to service_role;
create trigger broadcast_decor_change after insert or update or delete on public.couple_decor
  for each row execute function private.broadcast_room_change('decor');

create table public.couple_unlocks (
  couple_id uuid not null references public.couples (id) on delete cascade,
  item text not null,
  unlocked_by uuid references public.users (id) on delete set null,
  unlocked_at timestamptz not null default now(),
  primary key (couple_id, item)
);
alter table public.couple_unlocks enable row level security;
create policy "unlocks: the couple reads its unlocks" on public.couple_unlocks for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_unlocks from anon, authenticated;
grant select on public.couple_unlocks to authenticated;
grant select, insert, update, delete on public.couple_unlocks to service_role;
create trigger broadcast_unlock_change after insert or delete on public.couple_unlocks
  for each row execute function private.broadcast_room_change('hearts');

/**
 * Hearts the two of you have earned together, spent, and have left:
 *   20 a day you were both here · 10 a finished game · 15 a memory photo ·
 *   5 a note · 1 per 10 messages · 50 a month together · 5 per day of your best streak.
 */
create function public.couple_hearts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select private.current_couple_id() as id),
  parts as (
    select
      (select count(*) from (select v.day from public.couple_visits v, c where v.couple_id = c.id group by v.day having count(distinct v.user_id) = 2) d) * 20 as days,
      (select count(*) from public.game_sessions g, c where g.couple_id = c.id and g.status = 'completed') * 10 as games,
      (select count(*) from public.couple_memories m, c where m.couple_id = c.id) * 15 as memories,
      (select count(*) from public.couple_notes n, c where n.couple_id = c.id) * 5 as notes,
      (select count(*) from public.messages m, c where m.couple_id = c.id) / 10 as messages,
      (select greatest(0, (extract(year from age(current_date, coalesce(cp.together_since, cp.paired_at::date))) * 12
                         + extract(month from age(current_date, coalesce(cp.together_since, cp.paired_at::date))))::integer)
       from public.couples cp, c where cp.id = c.id) * 50 as months,
      coalesce((select s.best_days from public.couple_streak() s), 0) * 5 as streak,
      (select coalesce(sum(r.cost), 0) from public.couple_unlocks u, c, lateral private.decor_rule(u.item) r where u.couple_id = c.id) as spent
  )
  select jsonb_build_object(
    'earned', p.days + p.games + p.memories + p.notes + p.messages + coalesce(p.months, 0) + p.streak,
    'spent', p.spent,
    'balance', p.days + p.games + p.memories + p.notes + p.messages + coalesce(p.months, 0) + p.streak - p.spent,
    'parts', jsonb_build_object('days', p.days, 'games', p.games, 'memories', p.memories, 'notes', p.notes, 'messages', p.messages, 'months', coalesce(p.months, 0), 'streak', p.streak)
  )
  from parts p;
$$;

/** Unlock an item for good with hearts. */
create function public.unlock_decor(item text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  price integer;
  balance integer;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  select r.cost into price from private.decor_rule(unlock_decor.item) r;
  if price is null then raise exception 'room:invalid'; end if;
  -- One unlock at a time per couple, so two quick taps can't both spend.
  perform 1 from public.couples cp where cp.id = cid for update;
  if price > 0 and not exists (select 1 from public.couple_unlocks u where u.couple_id = cid and u.item = unlock_decor.item) then
    balance := (public.couple_hearts() ->> 'balance')::integer;
    if balance < price then raise exception 'room:not_enough_hearts'; end if;
    insert into public.couple_unlocks (couple_id, item, unlocked_by) values (cid, unlock_decor.item, uid);
  end if;
  return public.couple_hearts();
end;
$$;

/** Place an unlocked (or free) item. */
create function public.place_decor(item text, x double precision, z double precision, rotation double precision default 0)
returns public.couple_decor
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  rule record;
  row public.couple_decor;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  select * into rule from private.decor_rule(place_decor.item);
  if rule.cost is null then raise exception 'room:invalid'; end if;
  if rule.cost > 0 and not exists (select 1 from public.couple_unlocks u where u.couple_id = cid and u.item = place_decor.item) then raise exception 'room:locked'; end if;
  if x is null or z is null or rotation is null or x not between -4.5 and 4.5 or z not between -4 and 4 or rotation not between -7 and 7 then raise exception 'room:invalid'; end if;
  perform 1 from public.couples cp where cp.id = cid for update;
  if (select count(*) from public.couple_decor d where d.couple_id = cid) >= 60 then raise exception 'room:too_many'; end if;
  if (select count(*) from public.couple_decor d where d.couple_id = cid and d.item = place_decor.item) >= rule.max_count then raise exception 'room:too_many'; end if;
  insert into public.couple_decor (couple_id, item, x, z, rotation, placed_by) values (cid, place_decor.item, x, z, rotation, uid) returning * into row;
  return row;
end;
$$;

/** Move / turn a placed item. */
create function public.move_decor(decor_id uuid, x double precision, z double precision, rotation double precision)
returns public.couple_decor
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cid uuid := private.current_couple_id();
  row public.couple_decor;
begin
  if (select auth.uid()) is null or cid is null then raise exception 'room:not_paired'; end if;
  if x is null or z is null or rotation is null or x not between -4.5 and 4.5 or z not between -4 and 4 or rotation not between -7 and 7 then raise exception 'room:invalid'; end if;
  update public.couple_decor d set x = move_decor.x, z = move_decor.z, rotation = move_decor.rotation, updated_at = now()
  where d.id = decor_id and d.couple_id = cid
  returning * into row;
  if row.id is null then raise exception 'room:invalid'; end if;
  return row;
end;
$$;

/** Take an item out of the room (it stays unlocked). */
create function public.remove_decor(decor_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_couple_id() is null then raise exception 'room:not_paired'; end if;
  delete from public.couple_decor d where d.id = decor_id and d.couple_id = private.current_couple_id();
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on function public.pet_do(text, jsonb), public.name_pet(text), public.couple_hearts(), public.unlock_decor(text),
  public.place_decor(text, double precision, double precision, double precision), public.move_decor(uuid, double precision, double precision, double precision),
  public.remove_decor(uuid) from public, anon;
grant execute on function public.pet_do(text, jsonb), public.name_pet(text), public.couple_hearts(), public.unlock_decor(text),
  public.place_decor(text, double precision, double precision, double precision), public.move_decor(uuid, double precision, double precision, double precision),
  public.remove_decor(uuid) to authenticated;
