import "server-only";

/**
 * Finding a song on YouTube, so it can play for BOTH of you (Spotify only
 * plays on a Premium account's own device). Uses the YouTube Data API:
 * one search (100 quota units) + one details call (1 unit) per song, and the
 * answer is saved on the song (couple_tracks.youtube_id), so each song is only
 * ever looked up once. The free quota is 10,000 units a day ≈ 99 new songs a day.
 *
 * Environment (SERVER ONLY): YOUTUBE_API_KEY — console.cloud.google.com →
 * APIs & Services → enable "YouTube Data API v3" → Credentials → API key.
 * MUSIC_REGION (optional, default "NG"): only videos that play in this country.
 *
 * Videos that won't play for you are left out: not embeddable, blocked in your
 * country, or age-restricted (those never play inside another site). If one
 * still refuses when it plays (some labels block other sites), the player asks
 * again with that video excluded (`exclude`).
 */
const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "YouTubeError";
    this.code = code; // not_configured | not_found | quota | youtube_unavailable
  }
}

export const youtubeKey = (env = process.env) => String(env.YOUTUBE_API_KEY ?? "").trim() || null;
export const musicRegion = (env = process.env) => (/^[A-Z]{2}$/.test(String(env.MUSIC_REGION ?? "").trim()) ? env.MUSIC_REGION.trim() : "NG");

/** Will this video play inside Our Place, in `region`? (from the videos endpoint) */
export function playableHere(video, region) {
  if (!video) return false;
  if (video.status?.embeddable === false || (video.status?.privacyStatus && !["public", "unlisted"].includes(video.status.privacyStatus))) return false;
  if (video.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return false;
  const restriction = video.contentDetails?.regionRestriction;
  if (restriction?.blocked?.includes(region)) return false;
  if (restriction?.allowed && !restriction.allowed.includes(region)) return false;
  return true;
}

/** ISO 8601 duration ("PT3M21S") → seconds. */
export function isoSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso ?? ""));
  if (!m) return null;
  return (Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

const LIVE = /\b(live|concert|cover|karaoke|instrumental|8d|slowed|sped up|reverb|remix|nightcore|reaction)\b/i;
const GOOD = /\b(official (audio|music video|video|lyric video)|audio|lyrics?|visuali[sz]er|topic)\b/i;

/**
 * The best candidate for a song: close in length to the original (when we
 * know it), from the artist's channel or "- Topic", not a live/cover/remix
 * version (unless the song itself is one). Pure, so it's tested.
 */
export function pickBest(candidates, { title, artist, durationS }) {
  const wantsVariant = LIVE.test(title);
  const firstArtist = String(artist ?? "").split(",")[0].trim().toLowerCase();
  let best = null;
  for (const c of candidates) {
    if (!c.embeddable) continue;
    let score = 0;
    const text = `${c.title} ${c.channel}`.toLowerCase();
    if (durationS && c.durationS) {
      const off = Math.abs(c.durationS - durationS);
      score += off <= 3 ? 40 : off <= 10 ? 25 : off <= 30 ? 5 : -40;
    }
    if (firstArtist && text.includes(firstArtist)) score += 15;
    if (/ - topic$/i.test(c.channel)) score += 30; // YouTube Music's official audio ("Artist - Topic")
    if (GOOD.test(c.title)) score += 10;
    if (!wantsVariant && LIVE.test(c.title)) score -= 35;
    score -= c.rank * 2; // YouTube's own order counts a little
    if (!best || score > best.score) best = { ...c, score };
  }
  return best;
}

async function call(path, params, key) {
  const response = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key })}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 403 && JSON.stringify(data).includes("quota")) throw new YouTubeError("quota", "YouTube daily quota used up");
  if (!response.ok) throw new YouTubeError("youtube_unavailable", data.error?.message ?? `youtube ${response.status}`);
  return data;
}

/** → { youtubeId, title } for a song, or throws YouTubeError("not_found"). */
export async function findOnYouTube({ title, artist, durationS }, { key = youtubeKey(), region = musicRegion(), exclude = [] } = {}) {
  if (!key) throw new YouTubeError("not_configured");
  const query = `${String(artist ?? "").split(",")[0]} ${title}`.trim();
  const search = await call("search", { part: "snippet", q: query, type: "video", videoEmbeddable: "true", videoSyndicated: "true", regionCode: region, maxResults: "8", safeSearch: "none" }, key);
  const skip = new Set(exclude);
  const ids = (search.items ?? []).map((item) => item.id?.videoId).filter((id) => id && !skip.has(id));
  if (!ids.length) throw new YouTubeError("not_found");
  const details = await call("videos", { part: "contentDetails,status,snippet", id: ids.join(",") }, key);
  const byId = new Map((details.items ?? []).map((v) => [v.id, v]));
  const candidates = ids.map((id, rank) => {
    const v = byId.get(id);
    return { id, rank, title: v?.snippet?.title ?? "", channel: v?.snippet?.channelTitle ?? "", durationS: isoSeconds(v?.contentDetails?.duration), embeddable: playableHere(v, region) };
  });
  const best = pickBest(candidates, { title, artist, durationS });
  if (!best) throw new YouTubeError("not_found");
  return { youtubeId: best.id, title: best.title };
}
