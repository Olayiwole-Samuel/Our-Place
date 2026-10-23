/**
 * The range's rules (pure, tested). A round lasts ROUND_MS; targets pop up
 * downrange in your lane on a schedule made from the round's seed:
 *
 *   plate   stands still for a few seconds
 *   mover   slides side to side across the lane
 *   gold    small and quick — double points
 *
 * Score per hit by ring: bullseye 10, middle 7, outer 4 (gold ×2), times your
 * streak multiplier: ×1, then ×2 after 3 hits in a row, ×3 after 6. A miss
 * ends the streak. Everything is in metres in the range room's space
 * (lib/world/rooms/rangeRoom.js): lanes run toward −z from the counter.
 */
export const ROUND_MS = 45_000;
export const LANES = [-1.25, 1.25]; // lane centres (x)
export const LANE_HALF_WIDTH = 0.95;
export const MAX_POINTS_PER_HIT = 10 * 2 * 3;

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

/** Every target of a round: [{ id, kind, at, life, x, y, z, radius, sway, speed }] (ms from the start). */
export function roundPlan(seed, lane = 0) {
  const next = random(seed);
  const centre = LANES[lane] ?? 0;
  const targets = [];
  let at = 900;
  let id = 0;
  while (at < ROUND_MS - 1200) {
    const progress = at / ROUND_MS; // it gets busier as the round goes on
    const roll = next();
    const kind = roll < 0.16 ? "gold" : roll < 0.45 + progress * 0.2 ? "mover" : "plate";
    const z = -(2.2 + next() * 3.0); // 3.7–6.7 m from where you stand (the berm is at −5.6)
    const radius = kind === "gold" ? 0.13 : 0.2 + next() * 0.06;
    targets.push({
      id: id++,
      kind,
      at: Math.round(at),
      life: kind === "gold" ? 1500 : kind === "mover" ? 4200 : 3400 - progress * 1200,
      x: centre + (next() * 2 - 1) * (LANE_HALF_WIDTH - 0.35),
      y: 0.75 + next() * 1.0,
      z,
      radius,
      sway: kind === "mover" ? LANE_HALF_WIDTH - 0.3 : 0,
      speed: kind === "mover" ? 0.8 + next() * 0.9 : 0,
    });
    at += 650 + next() * (1500 - progress * 700);
  }
  return targets;
}

/** Where a target is `t` ms into the round (movers slide), and whether it's up. */
export function targetAt(target, t) {
  const age = t - target.at;
  const up = age >= 0 && age <= target.life;
  const x = target.sway ? target.x + Math.sin((age / 1000) * target.speed * Math.PI) * target.sway * 0.5 : target.x;
  return { x, y: target.y, z: target.z, up, age };
}

/** Points for a hit `distance` metres from a target's centre (0 = outside). */
export function ringPoints(target, distance) {
  const r = distance / target.radius;
  const base = r <= 0.22 ? 10 : r <= 0.58 ? 7 : r <= 1 ? 4 : 0;
  return target.kind === "gold" ? base * 2 : base;
}

/** The streak multiplier after `streak` hits in a row (before this one). */
export const multiplier = (streak) => Math.min(3, 1 + Math.floor(streak / 3));

/**
 * One shot along a ray (origin + direction, unit vector) at time `t`: the
 * nearest standing target it passes through, or a miss.
 * → { hit: true, target, points, distance, bullseye, point } | { hit: false }
 */
export function shoot(plan, hitIds, t, origin, direction) {
  let best = null;
  for (const target of plan) {
    if (hitIds.has(target.id)) continue;
    const at = targetAt(target, t);
    if (!at.up) continue;
    // Targets face the shooter (+z); intersect the ray with the target's plane z = at.z.
    if (Math.abs(direction.z) < 1e-6) continue;
    const k = (at.z - origin.z) / direction.z;
    if (k <= 0) continue;
    const point = { x: origin.x + direction.x * k, y: origin.y + direction.y * k, z: at.z };
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance > target.radius) continue;
    if (!best || k < best.k) best = { k, target, distance, point };
  }
  if (!best) return { hit: false };
  const points = ringPoints(best.target, best.distance);
  return { hit: true, target: best.target, points, distance: best.distance, bullseye: best.distance / best.target.radius <= 0.22, point: best.point };
}
