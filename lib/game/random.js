/**
 * Seeded pseudo-random generator (mulberry32). The game server owns the seed, so
 * dice rolls, shuffles and target spawns are decided server-side and a session can
 * be replayed exactly for debugging or dispute review. Not for cryptography.
 */
export function createRandom(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1));
  }

  function pick(items) {
    return items[int(0, items.length - 1)];
  }

  /** Returns a new shuffled array (Fisher–Yates); the input is not mutated. */
  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  return { next, int, pick, shuffle };
}
