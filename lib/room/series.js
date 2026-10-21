/**
 * Series on the TV (pure, tested). A video belongs to a series by its stored
 * series / season / episode (couple_videos, editable) or — when those aren't
 * set — by its title: "Squid Game S01E03", "Squid.Game.1x03", "Squid Game -
 * Episode 3", "Squid Game Ep 3". Episodes are ordered by season, then episode.
 */

const TIDY = (text) =>
  String(text ?? "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–:|]+|[\s\-–:|(]+$/g, "")
    .trim();

// Release tags that follow the episode number in file names.
const JUNK = /\b(?:\d{3,4}p|x26[45]|h ?26[45]|hevc|web(?:-?dl|rip)?|bluray|brrip|hdtv|dvdrip|aac|ac3|dts|yify|rarbg|10bit|hdr)\b.*$/i;

const PATTERNS = [
  /^(?<series>.*?)[\s._-]*\bS(?<season>\d{1,2})[\s._-]*E(?<episode>\d{1,4})\b(?<rest>.*)$/i, // S01E03
  /^(?<series>.*?)[\s._-]*\b(?<season>\d{1,2})x(?<episode>\d{1,4})\b(?<rest>.*)$/i, // 1x03
  /^(?<series>.*?)[\s._-]*\bSeason[\s._-]*(?<season>\d{1,2})[\s._-]*(?:Episode|Ep)[\s._-]*(?<episode>\d{1,4})\b(?<rest>.*)$/i, // Season 1 Episode 3
  /^(?<series>.*?)[\s._-]*\b(?:Episode|Ep)\.?[\s._-]*(?<episode>\d{1,4})\b(?<rest>.*)$/i, // Episode 3 / Ep 3
];

/** { series, season, episode, name } from a title, or null if it doesn't look like an episode. */
export function parseEpisode(title) {
  const text = TIDY(title);
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const series = TIDY(match.groups.series);
    if (!series) continue;
    const name = TIDY(TIDY(match.groups.rest).replace(JUNK, ""));
    return {
      series: series.slice(0, 80),
      season: match.groups.season ? Number(match.groups.season) : 1,
      episode: Number(match.groups.episode),
      name: name || null,
    };
  }
  return null;
}

/** A video's place in a series (stored values first, else read from its title), or null. */
export function episodeOf(video) {
  if (video?.series) return { series: video.series, season: video.season ?? 1, episode: video.episode ?? null, name: parseEpisode(video.title)?.name ?? null };
  return parseEpisode(video?.title);
}

const key = (name) => name.toLocaleLowerCase().replace(/\s+/g, " ").trim();

const byEpisode = (a, b) =>
  (a.place.season ?? 0) - (b.place.season ?? 0) || (a.place.episode ?? 1e9) - (b.place.episode ?? 1e9) || a.video.title.localeCompare(b.video.title) || String(a.video.createdAt).localeCompare(String(b.video.createdAt));

/**
 * The library, arranged: { series: [{ name, episodes: [{ video, place }], seasons }], singles: [video] }.
 * A "series" of one video stays a single unless it was put in a series on purpose.
 */
export function groupVideos(videos) {
  const groups = new Map();
  const singles = [];
  for (const video of videos) {
    const place = episodeOf(video);
    if (!place) {
      singles.push(video);
      continue;
    }
    const id = key(place.series);
    if (!groups.has(id)) groups.set(id, { name: place.series, episodes: [], chosen: false });
    const group = groups.get(id);
    group.episodes.push({ video, place });
    group.chosen ||= Boolean(video.series);
  }
  const series = [];
  for (const group of groups.values()) {
    if (group.episodes.length === 1 && !group.chosen) singles.push(group.episodes[0].video);
    else {
      group.episodes.sort(byEpisode);
      series.push({ name: group.name, episodes: group.episodes, seasons: new Set(group.episodes.map((e) => e.place.season)).size });
    }
  }
  series.sort((a, b) => a.name.localeCompare(b.name));
  return { series, singles };
}

/** The episode after (step 1) or before (step -1) this video in its series — ready ones only — or null. */
export function siblingEpisode(videos, id, step = 1) {
  const ready = videos.filter((video) => video.status === "ready" || video.id === id);
  const { series } = groupVideos(ready);
  for (const group of series) {
    const at = group.episodes.findIndex((entry) => entry.video.id === id);
    if (at === -1) continue;
    return group.episodes[at + step]?.video ?? null;
  }
  return null;
}

/** "S1 · E3" (or "E3", or "") for a place in a series. */
export function episodeLabel(place) {
  if (!place) return "";
  const episode = place.episode !== null && place.episode !== undefined ? `E${place.episode}` : "";
  return place.season && (place.season > 1 || episode) ? [`S${place.season}`, episode].filter(Boolean).join(" · ") : episode;
}
