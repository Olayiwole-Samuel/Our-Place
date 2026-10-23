-- ─────────────────────────────────────────────────────────────────────────────
-- The range: every round either of you shoots (score, hits, shots, best
-- streak), for the "best scores" board in the range room. Readable by the
-- couple; written only through record_range_score(), which keeps the numbers
-- possible (lib/range/targets.js: at most 60 points a hit) and allows one
-- round per 20 seconds each. Announced on the lobby topic, area "range".
-- ─────────────────────────────────────────────────────────────────────────────

create table public.couple_range_scores (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  score integer not null check (score between 0 and 12000),
  hits integer not null check (hits between 0 and 200),
  shots integer not null check (shots between 0 and 400),
  best_streak integer not null default 0 check (best_streak between 0 and 200),
  created_at timestamptz not null default now(),
  constraint couple_range_scores_hits_le_shots check (hits <= shots),
  constraint couple_range_scores_possible check (score <= hits * 60)
);
create index couple_range_scores_couple_score on public.couple_range_scores (couple_id, score desc);

alter table public.couple_range_scores enable row level security;
create policy "range: the couple reads its scores" on public.couple_range_scores for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_range_scores from anon, authenticated;
grant select on public.couple_range_scores to authenticated;
grant select, insert, update, delete on public.couple_range_scores to service_role;
create trigger broadcast_range_change after insert on public.couple_range_scores
  for each row execute function private.broadcast_room_change('range');

/** Save a round you just shot. */
create function public.record_range_score(score integer, hits integer, shots integer, best_streak integer default 0)
returns public.couple_range_scores
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  row public.couple_range_scores;
begin
  if uid is null or cid is null then raise exception 'room:not_paired'; end if;
  if score is null or hits is null or shots is null or best_streak is null
     or score < 0 or hits < 0 or shots < hits or shots > 400 or score > hits * 60 or best_streak > hits then
    raise exception 'room:invalid';
  end if;
  if exists (select 1 from public.couple_range_scores r where r.user_id = uid and r.created_at > now() - interval '20 seconds') then
    raise exception 'room:rate_limited';
  end if;
  insert into public.couple_range_scores (couple_id, user_id, score, hits, shots, best_streak)
  values (cid, uid, record_range_score.score, record_range_score.hits, record_range_score.shots, record_range_score.best_streak)
  returning * into row;
  return row;
end;
$$;

revoke all on function public.record_range_score(integer, integer, integer, integer) from public, anon;
grant execute on function public.record_range_score(integer, integer, integer, integer) to authenticated;
