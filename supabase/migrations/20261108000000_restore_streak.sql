-- Restore the together streak.
--
-- The streak counts days in a row on which BOTH of you opened Our Place
-- (couple_visits, couple_streak()). If you missed some days, either partner can
-- press "Restore streak": the missed days between your last day together and
-- yesterday are filled in for both of you, so the old run carries on.
-- Up to 30 missed days. Every restore is logged in couple_streak_restores.

create table public.couple_streak_restores (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  restored_by uuid not null references public.users (id) on delete cascade,
  from_day date not null,
  to_day date not null,
  created_at timestamptz not null default now()
);
comment on table public.couple_streak_restores is 'Each time a couple restored their together streak, and which days were filled in. Written by restore_streak() only.';

alter table public.couple_streak_restores enable row level security;
create policy "couple members read their couple's streak restores"
  on public.couple_streak_restores for select to authenticated
  using (couple_id = private.current_couple_id());
revoke all on public.couple_streak_restores from anon, authenticated;
grant select on public.couple_streak_restores to authenticated;
grant select on public.couple_streak_restores to service_role;

-- `tz` is the device's IANA time zone, like note_presence(). Returns how many
-- days were filled in.
create function public.restore_streak(tz text default 'Africa/Lagos')
returns integer
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
  last_both date;
  missed integer;
begin
  if uid is null or cid is null then
    raise exception 'room:not_paired';
  end if;
  begin
    today := (now() at time zone zone)::date;
  exception when others then
    today := (now() at time zone 'Africa/Lagos')::date;
  end;

  select max(d.day) into last_both from (
    select v.day from public.couple_visits v
    where v.couple_id = cid and v.day < today
    group by v.day
    having count(distinct v.user_id) = 2
  ) d;

  if last_both is null then
    raise exception 'streak:nothing_to_restore';
  end if;
  missed := (today - 1) - last_both;
  if missed <= 0 then
    raise exception 'streak:not_broken';
  end if;
  if missed > 30 then
    raise exception 'streak:too_long';
  end if;

  insert into public.couple_visits (couple_id, user_id, day)
  select m.couple_id, m.user_id, d::date
  from public.couple_members m
  cross join generate_series(last_both + 1, today - 1, interval '1 day') d
  where m.couple_id = cid
  on conflict (couple_id, user_id, day) do nothing;

  insert into public.couple_streak_restores (couple_id, restored_by, from_day, to_day)
  values (cid, uid, last_both + 1, today - 1);

  return missed;
end;
$$;
comment on function public.restore_streak(text) is
  'Fills in the days you missed (up to 30) between your last day together and yesterday, for both partners, so the together streak carries on.';

revoke all on function public.restore_streak(text) from public, anon;
grant execute on function public.restore_streak(text) to authenticated;
