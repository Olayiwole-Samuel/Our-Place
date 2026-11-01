/**
 * Bedroom helpers (pure, tested): which night it is, who said goodnight first,
 * the sleep timer, and the shooting stars — the same on both screens.
 */

const HOUR = 3_600_000;
const LAGOS_OFFSET = HOUR; // Lagos is UTC+1 all year

/** The night a moment belongs to, "YYYY-MM-DD": noon → noon in Lagos (1 a.m. is still tonight). Matches private.night_of(). */
export function nightOf(ms) {
  return new Date(ms + LAGOS_OFFSET - 12 * HOUR).toISOString().slice(0, 10);
}

/** Tonight's goodnights → { mine, theirs, first } (first = user id of whoever said it first, or null). */
export function goodnightTonight(rows, { me, partner, now = Date.now() }) {
  const tonight = nightOf(now);
  const of = (id) => rows.find((row) => row.userId === id && row.night === tonight) ?? null;
  const mine = of(me);
  const theirs = of(partner);
  let first = null;
  if (mine && theirs) first = Date.parse(mine.saidAt) <= Date.parse(theirs.saidAt) ? me : partner;
  else if (mine) first = me;
  else if (theirs) first = partner;
  return { mine, theirs, first, both: Boolean(mine && theirs) };
}

/** Is the sleep sound still on, and how long is left (ms; Infinity without a timer)? */
export function sleepSoundNow(bedroom, now = Date.now()) {
  if (!bedroom?.sound || !bedroom.startedAt) return { on: false, left: 0 };
  if (!bedroom.minutes) return { on: true, left: Infinity };
  const left = Date.parse(bedroom.startedAt) + bedroom.minutes * 60_000 - now;
  return left > 0 ? { on: true, left } : { on: false, left: 0 };
}

// ── Shooting stars ──────────────────────────────────────────────────────────
// Time is cut into windows; in most windows one star crosses the sky at a
// seeded moment, from a seeded spot, at a seeded angle. Both of you compute
// the same stars from the couple id and the (server-corrected) clock.
export const STAR_WINDOW_MS = 24_000;
export const STAR_MS = 1600; // how long a star takes to cross
export const WISH_MS = 9000; // after a star, you have a few seconds to make a wish

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The star of window `w` (or null): { at, x, y, angle, length } — x/y in 0..1 of the sky. */
export function starInWindow(seed, w) {
  const next = random(hash(`${seed}:star:${w}`));
  if (next() > 0.62) return null;
  return {
    id: `${w}`,
    at: w * STAR_WINDOW_MS + 1500 + next() * (STAR_WINDOW_MS - STAR_MS - 3000),
    x: 0.15 + next() * 0.6,
    y: 0.1 + next() * 0.35,
    angle: 0.35 + next() * 0.5, // radians below horizontal, heading right
    length: 0.18 + next() * 0.17,
  };
}

/** The star crossing the sky at `now` (with progress 0..1), and the latest one you can still wish on. */
export function skyAt(seed, now) {
  const w = Math.floor(now / STAR_WINDOW_MS);
  let crossing = null;
  let wishable = null;
  for (const k of [w - 1, w]) {
    const star = starInWindow(seed, k);
    if (!star) continue;
    const t = now - star.at;
    if (t >= 0 && t <= STAR_MS) crossing = { ...star, progress: t / STAR_MS };
    if (t >= 0 && t <= STAR_MS + WISH_MS) wishable = star;
  }
  return { crossing, wishable };
}
