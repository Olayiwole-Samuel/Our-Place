-- ─────────────────────────────────────────────────────────────────────────────
-- Series on the TV: a video can belong to a series (a show), with a season
-- and episode, so the TV lists episodes in order, offers "Next episode" and
-- plays the next one when an episode ends.
--
-- Filled in from the file name on upload ("Squid Game S01E03" → Squid Game,
-- season 1, episode 3) and editable by either partner. Written by the server
-- only (like the rest of couple_videos); readable by the couple.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.couple_videos
  add column series text,
  add column season integer,
  add column episode integer,
  add constraint couple_videos_series_name check (series is null or char_length(btrim(series)) between 1 and 80),
  add constraint couple_videos_season_range check (season is null or season between 0 and 99),
  add constraint couple_videos_episode_range check (episode is null or episode between 0 and 9999);

create index couple_videos_series on public.couple_videos (couple_id, series, season, episode) where series is not null;

grant select (series, season, episode) on public.couple_videos to authenticated;
