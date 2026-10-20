-- ─────────────────────────────────────────────────────────────────────────────
-- "Together since": the day the two of you got together (not the day you
-- paired up in Our Place). The bookshelf counts days and anniversaries from it.
-- Either partner can set or clear it through set_together_since(); couples
-- stay read-only to clients otherwise.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.couples
  add column together_since date,
  add constraint couples_together_since_sane check (together_since is null or together_since >= date '1950-01-01');

-- This instance is one couple's: they got together on 6 March 2026.
update public.couples set together_since = date '2026-03-06' where together_since is null;

create function public.set_together_since(day date)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cid uuid := private.current_couple_id();
begin
  if (select auth.uid()) is null or cid is null then raise exception 'room:not_paired'; end if;
  -- A day ahead of "today" allows for time zones; anything later is a typo.
  if day is not null and (day > current_date + 1 or day < date '1950-01-01') then raise exception 'room:invalid'; end if;
  update public.couples set together_since = day where id = cid;
  begin
    perform realtime.send(jsonb_build_object('area', 'trophies', 'op', 'update'), 'room', 'our-place:couple:' || cid::text || ':lobby', true);
  exception when others then
    null; -- best effort: the shelf re-reads when it opens
  end;
  return day;
end;
$$;

-- The bookshelf also reports the date (null = not set; it falls back to paired_at).
create or replace function public.couple_trophies()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'paired_at', (select c.paired_at from public.couples c where c.id = private.current_couple_id()),
    'together_since', (select c.together_since from public.couples c where c.id = private.current_couple_id()),
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

revoke all on function public.set_together_since(date) from public, anon;
grant execute on function public.set_together_since(date) to authenticated;
