-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — foundation migration
--
-- Establishes shared building blocks only. Product tables (users, couples,
-- game_sessions, …) arrive with the phases that use them. Conventions every
-- later migration follows are documented in docs/database.md:
--   * file name: YYYYMMDDHHMMSS_snake_case_description.sql (Supabase CLI order)
--   * primary keys: uuid default gen_random_uuid()
--   * timestamps: timestamptz, created_at/updated_at default now(), stored UTC
--   * foreign keys: <entity>_id, explicit ON DELETE behaviour, always indexed
--   * RLS enabled on every table in `public`, in the same migration that creates it
-- ─────────────────────────────────────────────────────────────────────────────

-- Internal helpers live in `private`, which is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- Keeps updated_at accurate regardless of which client performed the write.
-- Attach per table:
--   create trigger set_updated_at before update on public.<table>
--     for each row execute function private.set_updated_at();
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on schema private is 'Internal helpers (triggers, RLS predicates). Not exposed via the Data API.';
comment on function private.set_updated_at() is 'BEFORE UPDATE trigger: sets updated_at = now().';
