-- Restore streak, take two: also restore the gap BEFORE a streak you've
-- already started again. If your 17-day run broke and you've since been back
-- together for a day, the missed days between the two runs are filled in, so
-- the runs join up (17 + missed + 1).
--
-- streak_gap() says which days would be filled (none when nothing is missing),
-- so the app only shows "Restore streak" when there's something to restore.

-- The most recent gap in your days together, for couple `cid` on local day `today`.
create function private.streak_gap_for(cid uuid, today date)
returns table (from_day date, to_day date, missed integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  last_both date;
  run_start date;
  before_run date;
begin
  select max(d.day) into last_both from (
    select v.day from public.couple_visits v
    where v.couple_id = cid and v.day <= today
    group by v.day having count(distinct v.user_id) = 2
  ) d;
  if last_both is null then
    return;
  end if;

  if last_both < today - 1 then
    -- Broken: the days from your last day together up to yesterday.
    return query select last_both + 1, today - 1, (today - 1 - last_both)::integer;
    return;
  end if;

  -- Still going: the gap just before the current run.
  with both_days as (
    select v.day from public.couple_visits v
    where v.couple_id = cid and v.day <= today
    group by v.day having count(distinct v.user_id) = 2
  ),
  runs as (select day, day - (row_number() over (order by day))::integer as run_key from both_days)
  select min(r.day) into run_start from runs r
  where r.run_key = (select r2.run_key from runs r2 where r2.day = last_both);

  select max(d.day) into before_run from (
    select v.day from public.couple_visits v
    where v.couple_id = cid and v.day < run_start
    group by v.day having count(distinct v.user_id) = 2
  ) d;
  if before_run is null then
    return;
  end if;
  return query select before_run + 1, run_start - 1, (run_start - 1 - before_run)::integer;
end;
$$;
revoke all on function private.streak_gap_for(uuid, date) from public, anon, authenticated;

create function private.local_today(tz text)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  return (now() at time zone coalesce(nullif(tz, ''), 'Africa/Lagos'))::date;
exception when others then
  return (now() at time zone 'Africa/Lagos')::date;
end;
$$;
revoke all on function private.local_today(text) from public, anon, authenticated;

-- What "Restore streak" would fill in for the caller's couple (no row = nothing).
create function public.streak_gap(tz text default 'Africa/Lagos')
returns table (from_day date, to_day date, missed integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.from_day, g.to_day, g.missed
  from private.streak_gap_for(private.current_couple_id(), private.local_today(tz)) g
  where private.current_couple_id() is not null;
$$;
comment on function public.streak_gap(text) is
  'The missed days "Restore streak" would fill in: after your last day together, or just before the streak you are on now.';
revoke all on function public.streak_gap(text) from public, anon;
grant execute on function public.streak_gap(text) to authenticated;

create or replace function public.restore_streak(tz text default 'Africa/Lagos')
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  gap record;
  had_days boolean;
begin
  if uid is null or cid is null then
    raise exception 'room:not_paired';
  end if;
  select * into gap from private.streak_gap_for(cid, private.local_today(tz));
  if gap.from_day is null then
    select exists (select 1 from public.couple_visits v where v.couple_id = cid) into had_days;
    raise exception '%', case when had_days then 'streak:not_broken' else 'streak:nothing_to_restore' end;
  end if;
  if gap.missed > 30 then
    raise exception 'streak:too_long';
  end if;

  insert into public.couple_visits (couple_id, user_id, day)
  select m.couple_id, m.user_id, d::date
  from public.couple_members m
  cross join generate_series(gap.from_day, gap.to_day, interval '1 day') d
  where m.couple_id = cid
  on conflict (couple_id, user_id, day) do nothing;

  insert into public.couple_streak_restores (couple_id, restored_by, from_day, to_day)
  values (cid, uid, gap.from_day, gap.to_day);

  return gap.missed;
end;
$$;
comment on function public.restore_streak(text) is
  'Fills in the most recent gap in your days together (up to 30 days) for both partners: after your last day together, or just before the streak you are on now.';
