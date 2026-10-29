-- ─────────────────────────────────────────────────────────────────────────────
-- 18+ games (Flirty / Spicy): off by default, and only open when BOTH of you
-- have switched them on. Each partner's choice lives on their own membership
-- row; either of you can switch it off again at any time (and then they're
-- locked for both). Set only through set_mature_opt_in(); the game server
-- checks both rows before it starts an 18+ game (lib/game/sessions.server.js).
-- A change is announced on the lobby topic, area "mature".
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.couple_members add column mature_opt_in boolean not null default false;

create trigger broadcast_mature_change after update of mature_opt_in on public.couple_members
  for each row execute function private.broadcast_room_change('mature');

create function public.set_mature_opt_in(enabled boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'pairing:not_authenticated'; end if;
  if enabled is null then raise exception 'pairing:invalid_request'; end if;
  update public.couple_members set mature_opt_in = enabled where user_id = uid;
  if not found then raise exception 'pairing:not_paired'; end if;
  return enabled;
end;
$$;

revoke all on function public.set_mature_opt_in(boolean) from public, anon;
grant execute on function public.set_mature_opt_in(boolean) to authenticated;
