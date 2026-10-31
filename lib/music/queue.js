/**
 * The shared player's rules (pure, tested). The player state is one row per
 * couple (public.couple_music): a queue of song ids in play order, which one
 * is on, playing/paused and the position stamped by the database clock — so
 * both screens compute the same moment, exactly like the TV (lib/room/watch.js).
 */
import { expectedPosition } from "@/lib/room/watch";

export const REPEAT_MODES = Object.freeze(["off", "all", "one"]);

/** Where the song should be (seconds) now. */
export const musicPosition = (music, options) => (music && music.queue.length ? expectedPosition({ source: true, playing: music.playing, atSeconds: music.atSeconds, updatedAt: music.updatedAt }, options) : 0);

/** The song after the current one, by the repeat mode — or null when the queue ends. */
export function nextPosition(music, { manual = false } = {}) {
  if (!music?.queue.length) return null;
  if (music.repeat === "one" && !manual) return music.position;
  if (music.position + 1 < music.queue.length) return music.position + 1;
  return music.repeat === "off" && !manual ? null : 0;
}

/** The song before (or the start of this one if it's been playing a while). */
export function previousPosition(music, elapsed) {
  if (!music?.queue.length) return null;
  if (elapsed > 4 || music.position === 0) return elapsed > 4 ? music.position : music.queue.length - 1;
  return music.position - 1;
}

/** Fisher–Yates with Math.random (shuffling is a choice, not a shared random). */
export function shuffled(items, random = Math.random) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Shuffle on: the current song stays on, the rest are shuffled after it. */
export function shuffleQueue(queue, position, random) {
  if (!queue.length) return { queue, position: 0 };
  const current = queue[position];
  return { queue: [current, ...shuffled(queue.filter((_, i) => i !== position), random)], position: 0 };
}

/** Shuffle off: back to the playlist's order (when the queue came from one), still on the same song. */
export function unshuffleQueue(queue, position, playlistOrder) {
  if (!playlistOrder?.length) return { queue, position };
  const current = queue[position];
  const inQueue = new Set(queue);
  const ordered = [...playlistOrder.filter((id) => inQueue.has(id)), ...queue.filter((id) => !playlistOrder.includes(id))];
  return { queue: ordered, position: Math.max(0, ordered.indexOf(current)) };
}

/** Play this song next (right after the current one), without stopping. */
export function playNext(queue, position, trackId) {
  const without = queue.filter((id) => id !== trackId);
  const at = Math.min(without.length, without.indexOf(queue[position]) + 1);
  const next = [...without.slice(0, at), trackId, ...without.slice(at)];
  return { queue: next, position: Math.max(0, next.indexOf(queue[position])) };
}

/** A little beat for the lights while a song plays (we can't read YouTube's audio): a soft 0..1 pulse. */
export function beat(seconds, bpm = 104) {
  const phase = (seconds * bpm) / 60;
  return Math.pow(1 - (phase - Math.floor(phase)), 3);
}
