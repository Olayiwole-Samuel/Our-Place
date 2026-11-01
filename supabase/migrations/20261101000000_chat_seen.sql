-- ─────────────────────────────────────────────────────────────────────────────
-- Chat: "Seen". Each of you has a "seen up to" moment — the newest message
-- you've had in front of you with the chat open. Your messages up to your
-- partner's moment show as Seen (✓✓); later ones as Sent (✓).
--
-- Written only through mark_chat_seen() (it only ever moves forward, and never
-- past now); announced on the couple's private chat topic, event "seen".
-- ─────────────────────────────────────────────────────────────────────────────

create table public.chat_reads (
  user_id uuid primary key references public.users (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  seen_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.chat_reads enable row level security;
create policy "chat reads: the couple sees both" on public.chat_reads for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.chat_reads from anon, authenticated;
grant select on public.chat_reads to authenticated;
grant select, insert, update, delete on public.chat_reads to service_role;

create function public.mark_chat_seen(until timestamptz)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cid uuid := private.current_couple_id();
  moment timestamptz := least(mark_chat_seen.until, now());
  saved timestamptz;
begin
  if uid is null or cid is null then raise exception 'chat:not_paired'; end if;
  if moment is null then raise exception 'chat:invalid_request'; end if;
  insert into public.chat_reads as r (user_id, couple_id, seen_until)
  values (uid, cid, moment)
  on conflict (user_id) do update set seen_until = excluded.seen_until, couple_id = excluded.couple_id, updated_at = now()
    where excluded.seen_until > r.seen_until
  returning seen_until into saved;
  return coalesce(saved, (select r.seen_until from public.chat_reads r where r.user_id = uid));
end;
$$;
revoke all on function public.mark_chat_seen(timestamptz) from public, anon;
grant execute on function public.mark_chat_seen(timestamptz) to authenticated;

create function private.broadcast_chat_seen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('user_id', new.user_id, 'seen_until', new.seen_until),
      'seen',
      'our-place:couple:' || new.couple_id::text || ':chat',
      true
    );
  exception when others then
    null; -- best effort: the other screen also reads it when the chat opens
  end;
  return null;
end;
$$;
revoke all on function private.broadcast_chat_seen() from public, anon, authenticated;

create trigger broadcast_chat_seen
  after insert or update on public.chat_reads
  for each row execute function private.broadcast_chat_seen();
