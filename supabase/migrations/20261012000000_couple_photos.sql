-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — couple photos (Phase 6B: the personalised Ludo board)
--
-- The smallest media extension the board needs: four photo slots per couple.
--   together_a, together_b   two different photos of the couple together
--   portrait (per user)      one photo of each partner
-- Images live in the PRIVATE `couple-photos` bucket at <couple_id>/<file>.
-- Members read their own couple's rows and objects (RLS: the couple is derived
-- from auth.uid(), never from a client-supplied id) through short-lived signed
-- URLs. Only the server (service role) writes, after validating the image.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.couple_photos (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  slot text not null check (slot in ('together_a', 'together_b', 'portrait')),
  -- Set only for portraits: whose photo it is (a member of this couple).
  user_id uuid references public.users (id) on delete cascade,
  path text not null check (path ~ '^[0-9a-f-]{36}/[a-z0-9_-]{1,80}\.(jpg|png|webp)$'),
  updated_at timestamptz not null default now(),
  constraint couple_photos_portrait_has_user check ((slot = 'portrait') = (user_id is not null)),
  constraint couple_photos_path_in_couple_folder check (split_part(path, '/', 1) = couple_id::text)
);

comment on table public.couple_photos is
  'Couple photo slots (two together photos, one portrait per partner). Written only by the server.';

create unique index couple_photos_together_slot on public.couple_photos (couple_id, slot) where slot <> 'portrait';
create unique index couple_photos_portrait_user on public.couple_photos (couple_id, user_id) where slot = 'portrait';

create trigger set_updated_at before update on public.couple_photos
  for each row execute function private.set_updated_at();

alter table public.couple_photos enable row level security;

create policy "couple members read their couple's photos"
  on public.couple_photos
  for select
  to authenticated
  using (couple_id = private.current_couple_id());

revoke all on public.couple_photos from anon, authenticated;
grant select (id, couple_id, slot, user_id, path, updated_at) on public.couple_photos to authenticated;
grant select, insert, update, delete on public.couple_photos to service_role;

-- ── Photo storage ───────────────────────────────────────────────────────────
-- Board-sized images only (the client downsizes before upload; the server
-- enforces type and size again).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('couple-photos', 'couple-photos', false, 1572864, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "couple photos: members of the couple can read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'couple-photos'
    and (storage.foldername(name))[1] = private.current_couple_id()::text
  );
