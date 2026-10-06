-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — characters (each user's persistent full-body 3D identity)
--
-- A character belongs to ONE user (not the couple). Rules:
--   * the owner can read, create and update their own character
--   * the partner can READ the owner's character (to render it in the world)
--     but sees only presentation columns — never provider generation metadata
--   * nobody can change another user's character, model or outfit
--   * user_id is always the caller's own id (enforced by RLS WITH CHECK)
--   * provider, model and provider metadata can only be set by the server
--     (service role, after it has imported and verified a generated model);
--     clients may only write `config` for the built-in "ourplace" provider
--
-- Raw selfies are never stored by Our Place (they go from the browser straight
-- to the avatar provider), so there is no selfie table or bucket.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  provider text not null default 'ourplace' check (provider in ('ourplace', 'metaperson')),
  version smallint not null default 1 check (version >= 1),
  -- The Our Place Character Model (lib/character/schema.js); validated by the API.
  config jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 16384),
  -- Storage paths (bucket character-models), never public URLs. Server-written only.
  model_path text check (model_path is null or model_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+\.glb$'),
  thumbnail_path text check (thumbnail_path is null or thumbnail_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(png|jpg|webp)$'),
  -- Provider generation metadata (e.g. MetaPerson avatar code + customisation
  -- state for re-editing). Private: not readable through the API by anyone.
  provider_ref text,
  provider_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A provider model must live in the owner's own folder.
  constraint characters_model_in_own_folder check (model_path is null or starts_with(model_path, user_id::text || '/')),
  constraint characters_thumbnail_in_own_folder check (thumbnail_path is null or starts_with(thumbnail_path, user_id::text || '/'))
);

comment on table public.characters is 'One persistent full-body character per user. Partner may read presentation columns.';

create trigger set_updated_at before update on public.characters
  for each row execute function private.set_updated_at();

alter table public.characters enable row level security;

create policy "characters: owner and partner can view" on public.characters
  for select to authenticated
  using (user_id = (select auth.uid()) or user_id = private.current_partner_id());

create policy "characters: owner creates their own" on public.characters
  for insert to authenticated
  with check (user_id = (select auth.uid()) and provider = 'ourplace' and model_path is null);

create policy "characters: owner updates their own" on public.characters
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Least privilege. Presentation columns only; provider_ref / provider_state are
-- never granted. Clients may write only user_id (insert) and config.
revoke all on public.characters from anon, authenticated;
grant select (id, user_id, provider, version, config, model_path, thumbnail_path, updated_at) on public.characters to authenticated;
grant insert (user_id, config) on public.characters to authenticated;
grant update (config) on public.characters to authenticated;

-- ── Model storage ───────────────────────────────────────────────────────────
-- Private bucket. Objects live at <user_id>/<file>. The owner and their partner
-- can read (via short-lived signed URLs created server-side); only the server
-- (service role) writes, after validating the file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-models', 'character-models', false, 31457280, array['model/gltf-binary', 'application/octet-stream', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "character models: owner and partner can read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'character-models'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (storage.foldername(name))[1] = private.current_partner_id()::text
    )
  );
