import { DECOR, dogSpots } from "@/lib/room/decor";
import { alongPath, findPath, freeSpotNear, pathLength } from "./path";

/**
 * Your dog's day, as a pure function of time — so both of your screens show
 * the same dog in the same place without sending its every step:
 *
 *   dogAt(pet, world, serverNowMs) → { x, z, ry, anim, pose, wag, hearts, ball, carrying, activity }
 *
 * - Between your requests it follows its own routine in 14-second "moments",
 *   chosen by a seeded random from the couple and the moment's number: wander,
 *   sniff about, look around, sit, lie down, nap in its house or bed, drink at
 *   its bowl, play by its toys — and sleep through the night (Lagos time).
 *   It walks there along a path around the furniture (path.js).
 * - When one of you asks it something (pet_do: pet, treat, feed, fetch, sit,
 *   lie, come, sleep) that request — when, from where, to where — is a
 *   timeline both screens play; afterwards the routine carries on from where
 *   the request left it.
 *
 * anim: "idle" | "look" | "sniff" | "walk" | "run" | "eat" | "petted" | "jump"
 * pose: "stand" | "sit" | "lie" | "sleep" (layered on the animation by Dog.jsx)
 */
export const DOG_RADIUS = 0.2;
export const MOMENT_MS = 14_000;
const WALK_SPEED = 0.85; // m/s, a small dog's trot
const RUN_SPEED = 2.4;
const EPOCH = Date.UTC(2026, 0, 1);
const NEAR = 0.55; // how close it comes to you

// ── Seeded random (same numbers on both screens) ─────────────────────────────
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function random(seed) {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

const lagosHour = (ms) => (new Date(ms).getUTCHours() + 1) % 24;
const isNight = (ms) => {
  const hour = lagosHour(ms);
  return hour >= 23 || hour < 7;
};

/** In front of a placed item (its local +z side), at `gap` metres from its edge. */
function frontOf(thing, gap = 0.3) {
  const entry = DECOR[thing.item];
  const reach = (entry?.size?.[1] ?? 0.4) / 2 + gap;
  return { x: thing.x + Math.sin(thing.rotation) * reach, z: thing.z + Math.cos(thing.rotation) * reach };
}

/** Where the dog naps: its bed, else in front of its house, else a quiet corner. */
function napSpot(world, from) {
  const bed = dogSpots(world.placed, "bed", from)[0];
  if (bed) return { at: { x: bed.x, z: bed.z }, ry: bed.rotation + Math.PI };
  const house = dogSpots(world.placed, "house", from)[0];
  if (house) return { at: frontOf(house, 0.15), ry: house.rotation + Math.PI };
  return { at: freeSpotNear(world, { x: world.bounds.minX + 0.6, z: world.bounds.maxZ - 0.6 }, DOG_RADIUS), ry: Math.PI / 4 };
}

/** Home: where the routine starts before anything ever happened. */
const homeSpot = (world) => napSpot(world, { x: 0, z: 0 }).at;

function randomSpot(world, next) {
  const { bounds } = world;
  for (let i = 0; i < 12; i++) {
    const point = { x: bounds.minX + 0.5 + next() * (bounds.maxX - bounds.minX - 1), z: bounds.minZ + 0.5 + next() * (bounds.maxZ - bounds.minZ - 1) };
    const free = freeSpotNear(world, point, DOG_RADIUS);
    if (Math.hypot(free.x - point.x, free.z - point.z) < 0.01) return point;
  }
  return freeSpotNear(world, { x: 0, z: 1.8 }, DOG_RADIUS);
}

/** What the dog does in routine moment `k` after `anchor` (where it was): { to, then, pose, ry? } — `to` always a free spot. */
function moment(world, anchor, k) {
  const plan = pickMoment(world, anchor, k);
  return { ...plan, to: freeSpotNear(world, plan.to, DOG_RADIUS) };
}

function pickMoment(world, anchor, k) {
  const next = random(hash(`${world.seed}:${anchor.t}:${k}`));
  const night = isNight(anchor.t + k * MOMENT_MS);
  const roll = next();
  const bowl = dogSpots(world.placed, "bowl")[0];
  const toys = dogSpots(world.placed, "toys")[0];
  if (night ? roll < 0.85 : roll < 0.14) {
    const nap = napSpot(world, anchor.at);
    return { to: nap.at, then: "idle", pose: "sleep", ry: nap.ry };
  }
  if (bowl && roll < (night ? 0.9 : 0.24)) return { to: frontOf(bowl), then: "eat", pose: "stand", ry: bowl.rotation + Math.PI };
  if (toys && roll < (night ? 0.93 : 0.34)) return { to: frontOf(toys), then: "jump", pose: "stand", ry: toys.rotation + Math.PI };
  const to = randomSpot(world, next);
  const what = next();
  if (what < 0.3) return { to, then: "sniff", pose: "stand" };
  if (what < 0.55) return { to, then: "look", pose: "stand" };
  if (what < 0.75) return { to, then: "idle", pose: "sit" };
  if (what < 0.9) return { to, then: "idle", pose: "lie" };
  return { to, then: "idle", pose: "stand" };
}

/** Walk along a path, then stay. Returns the state at `elapsed` ms, or null once the walk is over. */
function walking(world, from, target, elapsed, speed) {
  const to = freeSpotNear(world, target, DOG_RADIUS); // e.g. "in front of the bowl" when the bowl faces a wall
  const path = findPath(world, from, to, DOG_RADIUS);
  const length = pathLength(path);
  const walkMs = (length / speed) * 1000;
  if (elapsed < walkMs) {
    const p = alongPath(path, (elapsed / 1000) * speed);
    return { done: false, walkMs, x: p.x, z: p.z, ry: p.ry ?? 0 };
  }
  const end = path.at(-1);
  const last = path.length > 1 ? Math.atan2(end.x - path.at(-2).x, end.z - path.at(-2).z) : 0;
  return { done: true, walkMs, x: end.x, z: end.z, ry: last };
}

const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
/** A spot `NEAR` metres short of `target`, on the dog's side. */
function approach(world, from, target) {
  const d = Math.hypot(target.x - from.x, target.z - from.z) || 1;
  const spot = { x: target.x + ((from.x - target.x) / d) * NEAR, z: target.z + ((from.z - target.z) / d) * NEAR };
  return freeSpotNear(world, spot, DOG_RADIUS);
}

const base = { anim: "idle", pose: "stand", wag: 0.3, hearts: false, ball: null, carrying: false };

/**
 * A request's timeline: an ordered list of steps, each { ms, at(t) → state }.
 * Returns { steps, total, end: { at, ry } }.
 */
function requestTimeline(pet, world) {
  const data = pet.actionData ?? {};
  const start = data.start ?? homeSpot(world);
  const actor = data.from ?? start;
  const steps = [];
  let at = start;
  let ry = facing(start, actor);
  const walkTo = (to, speed = WALK_SPEED, extra = {}) => {
    const probe = walking(world, at, to, 0, speed);
    const from = at;
    steps.push({ ms: probe.walkMs, at: (t) => ({ ...base, ...walking(world, from, to, t, speed), anim: speed > WALK_SPEED ? "run" : "walk", wag: 0.7, ...extra }) });
    const end = walking(world, from, to, Infinity, speed);
    at = { x: end.x, z: end.z };
    ry = end.ry;
  };
  const stay = (ms, state) => {
    const here = at;
    const r = state.ry ?? ry;
    steps.push({ ms, at: () => ({ ...base, x: here.x, z: here.z, ry: r, ...state, ry: r }) });
    ry = r;
  };

  switch (pet.action) {
    case "come":
      walkTo(approach(world, start, actor));
      stay(6000, { pose: "sit", wag: 0.9, ry: facing(at, actor) });
      break;
    case "pet":
      walkTo(approach(world, start, actor));
      stay(4500, { anim: "petted", wag: 1, hearts: true, ry: facing(at, actor) });
      break;
    case "treat":
      walkTo(approach(world, start, actor));
      stay(1500, { pose: "sit", wag: 1, ry: facing(at, actor) });
      stay(2500, { anim: "eat", wag: 0.8 });
      stay(1300, { anim: "jump", wag: 1, hearts: true });
      break;
    case "feed": {
      const bowl = dogSpots(world.placed, "bowl", start)[0];
      if (bowl) walkTo(frontOf(bowl));
      else walkTo(approach(world, start, actor));
      stay(8000, { anim: "eat", wag: 0.6, ry: bowl ? bowl.rotation + Math.PI : ry });
      break;
    }
    case "fetch": {
      const to = freeSpotNear(world, data.to ?? actor, DOG_RADIUS);
      const throwMs = 800;
      const ballFlight = (t) => {
        const k = Math.min(1, t / throwMs);
        return { x: actor.x + (to.x - actor.x) * k, y: 0.9 * (1 - k) + 1.6 * k * (1 - k) + 0.06, z: actor.z + (to.z - actor.z) * k };
      };
      // Watches the throw, then races to the ball, picks it up, brings it back.
      const here = at;
      steps.push({ ms: throwMs, at: (t) => ({ ...base, x: here.x, z: here.z, ry: facing(here, to), anim: "look", wag: 1, ball: ballFlight(t) }) });
      const ballAt = { ...to, y: 0.06 };
      const runStart = steps.length;
      walkTo(to, RUN_SPEED);
      const run = steps[runStart];
      steps[runStart] = { ms: run.ms, at: (t) => ({ ...run.at(t), ball: ballAt }) };
      stay(700, { anim: "sniff", wag: 1, carrying: true });
      walkTo(approach(world, at, actor), RUN_SPEED, { carrying: true });
      stay(2500, { pose: "sit", wag: 1, hearts: true, ry: facing(at, actor), ball: { x: at.x + Math.sin(facing(at, actor)) * 0.25, y: 0.06, z: at.z + Math.cos(facing(at, actor)) * 0.25 } });
      break;
    }
    case "sit":
      stay(12_000, { pose: "sit", wag: 0.5 });
      break;
    case "lie":
      stay(20_000, { pose: "lie", wag: 0.2 });
      break;
    case "sleep": {
      const nap = napSpot(world, start);
      walkTo(nap.at);
      stay(90_000, { pose: "sleep", wag: 0, ry: nap.ry });
      break;
    }
    default:
      stay(1, {});
  }
  return { steps, total: steps.reduce((sum, step) => sum + step.ms, 0), end: { at, ry } };
}

/** The dog right now. `pet` = { action, actionAt (ms), actionData, createdAt (ms) }; `world` = { key, seed, bounds, colliders, placed }. */
export function dogAt(pet, world, now) {
  let anchor = { at: homeSpot(world), t: EPOCH, ry: 0 };
  if (pet?.action && pet.actionAt) {
    const timeline = requestTimeline(pet, world);
    let t = now - pet.actionAt;
    if (t < timeline.total) {
      for (const step of timeline.steps) {
        if (t < step.ms) return { ...step.at(Math.max(0, t)), activity: pet.action };
        t -= step.ms;
      }
    }
    anchor = { at: timeline.end.at, t: pet.actionAt + timeline.total, ry: timeline.end.ry };
  }

  // The routine: moment k goes from where moment k-1 ended to its own spot.
  const k = Math.max(0, Math.floor((now - anchor.t) / MOMENT_MS));
  const from = k === 0 ? anchor.at : moment(world, anchor, k - 1).to;
  const plan = moment(world, anchor, k);
  const elapsed = now - anchor.t - k * MOMENT_MS;
  const walk = walking(world, from, plan.to, elapsed, WALK_SPEED);
  if (!walk.done) return { ...base, x: walk.x, z: walk.z, ry: walk.ry, anim: "walk", wag: 0.5, activity: "routine" };
  const settled = elapsed - walk.walkMs;
  return { ...base, x: walk.x, z: walk.z, ry: plan.ry ?? walk.ry, anim: plan.then, pose: settled > 600 ? plan.pose : "stand", wag: plan.pose === "sleep" ? 0 : 0.35, activity: "routine" };
}

/** Is a request still playing? (for the panel) */
export function busyUntil(pet, world) {
  if (!pet?.action || !pet.actionAt) return 0;
  return pet.actionAt + requestTimeline(pet, world).total;
}

/** How the dog feels, from when it was last fed / petted / played with. */
export function moodOf(pet, now) {
  const hours = (iso) => (iso ? (now - Date.parse(iso)) / 3_600_000 : Infinity);
  if (hours(pet?.fedAt) > 10) return { id: "hungry", text: "is hungry", icon: "🍖" };
  if (hours(pet?.playedAt) > 8) return { id: "bored", text: "wants to play", icon: "🎾" };
  if (hours(pet?.pettedAt) > 6) return { id: "lonely", text: "wants cuddles", icon: "🤍" };
  return { id: "happy", text: "is happy", icon: "💕" };
}
