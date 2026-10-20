/**
 * Watch-together helpers (pure, tested): reading a YouTube link, and where the
 * shared TV should be right now.
 *
 * The TV state is { source, playing, atSeconds, updatedAt } — written through
 * set_watch(), stamped by the DATABASE clock. Both screens compute the same
 * moment from it: atSeconds, plus the time since updatedAt while playing.
 * `skewMs` corrects this device's clock to the server's (estimated from our
 * own writes), so phones with a wrong clock stay in sync too.
 */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id from any common YouTube link (or a bare id), else null. */
export function parseYouTube(input) {
  const text = String(input ?? "").trim();
  if (YOUTUBE_ID.test(text)) return text;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[1] ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Where the TV should be (seconds) at local time `now`. */
export function expectedPosition(watch, { now = Date.now(), skewMs = 0 } = {}) {
  if (!watch?.source) return 0;
  const base = Number(watch.atSeconds) || 0;
  if (!watch.playing) return base;
  const elapsed = (now + skewMs - Date.parse(watch.updatedAt)) / 1000;
  return Math.max(0, base + Math.max(0, elapsed));
}

/** How far off a player is, and whether to correct it (seconds). */
export function needsSeek(current, expected, { tolerance = 1.5 } = {}) {
  return Math.abs((Number(current) || 0) - expected) > tolerance;
}

/** 0:42 · 12:05 · 1:02:33 */
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Same source? (YouTube id or our video id) */
export const sameSource = (a, b) => Boolean(a && b && a.type === b.type && a.id === b.id);

/** File types the TV can play in most browsers. MKV plays only if its codecs are H.264/AAC. */
export const VIDEO_TYPES = Object.freeze({ "video/mp4": "MP4", "video/webm": "WebM", "video/quicktime": "MOV", "video/x-matroska": "MKV", "video/ogg": "OGV" });

/** The content type for a picked file (some phones report MKV/MOV as empty or octet-stream). */
export function videoTypeOf(file) {
  if (VIDEO_TYPES[file?.type]) return file.type;
  const ext = String(file?.name ?? "")
    .toLowerCase()
    .split(".")
    .pop();
  return { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", ogv: "video/ogg" }[ext] ?? null;
}
