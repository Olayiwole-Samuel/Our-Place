-- ─────────────────────────────────────────────────────────────────────────────
-- Our Place — more character sources
--
--   ourplace    built-in studio character (config only)            [existing]
--   metaperson  selfie-generated model, imported by the server     [existing]
--   library     a ready-made character from the built-in gallery   [new]
--   imported    the user's own uploaded GLB, validated by server   [new]
--
-- Gallery models ship with the app (public/models/characters, CC0); a character
-- only stores the gallery id. Imported models live in the private
-- character-models bucket like provider models and are only ever recorded by
-- the server after validation (full-body, rigged, size/extension checks).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.characters drop constraint characters_provider_check;
alter table public.characters
  add constraint characters_provider_check check (provider in ('ourplace', 'metaperson', 'library', 'imported'));

alter table public.characters
  add column library_model text check (library_model is null or library_model ~ '^[a-z0-9_]{1,40}$');

-- A gallery character must name its model; other sources must not.
alter table public.characters
  add constraint characters_library_model_matches_provider
  check ((provider = 'library') = (library_model is not null));

comment on column public.characters.library_model is 'Gallery model id (lib/character/gallery.js) when provider = library.';

-- Presentation column: owner and partner may read it (to render).
grant select (library_model) on public.characters to authenticated;
-- Choosing a gallery character goes through the API (validated against the
-- gallery list) and is written by the server, like other provider changes.
