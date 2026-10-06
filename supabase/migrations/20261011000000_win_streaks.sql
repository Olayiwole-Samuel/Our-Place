-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — individual win streaks (Phase 6B)
--
-- One row per player per game: the current run of wins and the best ever.
-- Driven only by game_sessions: when a session becomes 'completed' with
-- streak_eligible = true (a 'win' in a winStreakEligible game, decided by the
-- server's engine), the winner's streak goes up by one and the other player's
-- resets to 0. Draws, conversation games and abandoned/cancelled sessions
-- never touch streaks. No client and no game code writes this table.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.win_streaks (
  couple_id uuid not null references public.couples (id) on delete cascade,
  game_id text not null check (game_id ~ '^[a-z][a-z0-9_]{0,47}$'),
  user_id uuid not null references public.users (id) on delete cascade,
  current integer not null default 0 check (current >= 0),
  best integer not null default 0 check (best >= current),
  last_session uuid references public.game_sessions (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (couple_id, game_id, user_id)
);

comment on table public.win_streaks is
  'Per-player, per-game win streaks. Written only by the game_sessions completion trigger.';

alter table public.win_streaks enable row level security;

create policy "couple members read their couple's win streaks"
  on public.win_streaks
  for select
  to authenticated
  using (private.is_couple_member(couple_id));

revoke all on public.win_streaks from anon, authenticated;
grant select on public.win_streaks to authenticated;
grant select on public.win_streaks to service_role;

-- Runs once per session, on the transition into 'completed'.
create function private.apply_win_streaks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player uuid;
begin
  if not new.streak_eligible or new.winner_id is null then
    return null;
  end if;
  foreach player in array new.players loop
    if player = new.winner_id then
      insert into public.win_streaks as w (couple_id, game_id, user_id, current, best, last_session)
      values (new.couple_id, new.game_id, player, 1, 1, new.id)
      on conflict (couple_id, game_id, user_id) do update
        set current = w.current + 1,
            best = greatest(w.best, w.current + 1),
            last_session = excluded.last_session,
            updated_at = now();
    else
      insert into public.win_streaks as w (couple_id, game_id, user_id, current, best, last_session)
      values (new.couple_id, new.game_id, player, 0, 0, new.id)
      on conflict (couple_id, game_id, user_id) do update
        set current = 0,
            last_session = excluded.last_session,
            updated_at = now();
    end if;
  end loop;
  return null;
end;
$$;

create trigger apply_win_streaks
  after update of status on public.game_sessions
  for each row
  when (old.status is distinct from 'completed' and new.status = 'completed')
  execute function private.apply_win_streaks();

revoke all on function private.apply_win_streaks() from public, anon, authenticated;
