-- ─────────────────────────────────────────────────────────────────────────────
-- Picture frames around the house (the hallway's walls…): which of your
-- memory photos hangs in which frame. A frame without a choice shows your
-- newest photos by itself. Readable by the couple; set through set_frame().
-- Announced on the lobby topic, area "frames".
-- ─────────────────────────────────────────────────────────────────────────────

create table public.couple_frames (
  couple_id uuid not null references public.couples (id) on delete cascade,
  frame_id text not null check (frame_id ~ '^[a-z0-9_]{1,40}$'),
  memory_id uuid references public.couple_memories (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (couple_id, frame_id)
);
alter table public.couple_frames enable row level security;
create policy "frames: the couple reads its frames" on public.couple_frames for select to authenticated using (couple_id = private.current_couple_id());
revoke all on public.couple_frames from anon, authenticated;
grant select on public.couple_frames to authenticated;
grant select, insert, update, delete on public.couple_frames to service_role;
create trigger broadcast_frame_change after insert or update or delete on public.couple_frames
  for each row execute function private.broadcast_room_change('frames');

/** Hang one of your photos in a frame (memory_id null = back to "newest photos"). */
create function public.set_frame(frame_id text, memory_id uuid default null)
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
  if frame_id is null or frame_id !~ '^[a-z0-9_]{1,40}$' then raise exception 'room:invalid'; end if;
  if memory_id is not null and not exists (select 1 from public.couple_memories m where m.id = set_frame.memory_id and m.couple_id = cid) then
    raise exception 'room:invalid';
  end if;
  if memory_id is null then
    delete from public.couple_frames f where f.couple_id = cid and f.frame_id = set_frame.frame_id;
  else
    insert into public.couple_frames (couple_id, frame_id, memory_id, updated_by)
    values (cid, set_frame.frame_id, set_frame.memory_id, uid)
    on conflict on constraint couple_frames_pkey do update set memory_id = excluded.memory_id, updated_by = excluded.updated_by, updated_at = now();
  end if;
end;
$$;

revoke all on function public.set_frame(text, uuid) from public, anon;
grant execute on function public.set_frame(text, uuid) to authenticated;
