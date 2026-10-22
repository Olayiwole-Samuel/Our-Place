import { describe, expect, it } from "vitest";
import { decorColliders } from "@/lib/room/decor";
import { isBlocked } from "@/lib/world/collision";
import { livingRoom, roomColliders } from "@/lib/world/rooms/livingRoom";
import { DOG_RADIUS, MOMENT_MS, busyUntil, dogAt, growthOf, moodOf } from "./behaviour";
import { findPath, pathLength } from "./path";

const placed = [
  { id: "h", item: "dog_house", x: -3.6, z: 3.2, rotation: 0 },
  { id: "b", item: "dog_bowl", x: -2.6, z: 3.5, rotation: 0 },
  { id: "c", item: "armchair", x: 2.5, z: 2.5, rotation: Math.PI / 2 },
];
const world = { key: "test-1", seed: "couple-1", bounds: livingRoom.bounds, colliders: [...roomColliders(livingRoom), ...decorColliders(placed)], placed };
// Inside a solid thing? (a little slack: the dog's own radius is already kept clear)
const inside = (p) => isBlocked(p, { radius: DOG_RADIUS * 0.6, bounds: world.bounds, colliders: world.colliders });
const noon = Date.UTC(2026, 9, 22, 11, 0, 0); // 12:00 in Lagos

describe("the dog's routine", () => {
  it("is the same on both screens and never walks through furniture or teleports", () => {
    let last = null;
    for (let t = noon; t < noon + 6 * MOMENT_MS; t += 250) {
      const a = dogAt(null, world, t);
      const b = dogAt(null, { ...world }, t); // the other screen
      expect(b).toEqual(a);
      expect(inside(a), `inside furniture at ${t - noon} ms: ${a.x.toFixed(2)},${a.z.toFixed(2)}`).toBe(false);
      if (last) expect(Math.hypot(a.x - last.x, a.z - last.z)).toBeLessThan(0.35); // ≤ walking pace over 250 ms
      last = a;
    }
  });

  it("does a mix of things in the day, and mostly sleeps at night", () => {
    const day = new Set();
    for (let k = 0; k < 120; k++) {
      const s = dogAt(null, world, noon + k * MOMENT_MS + MOMENT_MS - 50);
      day.add(s.pose === "stand" ? s.anim : s.pose);
    }
    expect(day.size).toBeGreaterThanOrEqual(5);
    const night = Date.UTC(2026, 9, 22, 1, 0, 0); // 02:00 in Lagos
    let sleeping = 0;
    for (let k = 0; k < 40; k++) if (dogAt(null, world, night + k * MOMENT_MS + MOMENT_MS - 50).pose === "sleep") sleeping++;
    expect(sleeping).toBeGreaterThan(25);
  });

  it("finds a way around furniture", () => {
    const path = findPath(world, { x: 0, z: -1.6 }, { x: 0, z: 0.4 }, DOG_RADIUS); // the couch is in between
    expect(path.length).toBeGreaterThan(2);
    expect(pathLength(path)).toBeGreaterThan(2.0);
  });
});

describe("asking the dog", () => {
  const at = noon + 1000;
  const ask = (action, data) => ({ action, actionAt: at, actionData: { start: { x: 0, z: 2 }, from: { x: 1.5, z: 2.5 }, ...data } });

  it("comes to you and sits; then carries on from there", () => {
    const pet = ask("come");
    const arrived = dogAt(pet, world, at + 5000);
    expect(Math.hypot(arrived.x - 1.5, arrived.z - 2.5)).toBeLessThan(0.7);
    expect(arrived.pose).toBe("sit");
    const after = dogAt(pet, world, busyUntil(pet, world) + 10);
    expect(Math.hypot(after.x - arrived.x, after.z - arrived.z)).toBeLessThan(0.05); // no jump when the routine resumes
  });

  it("plays fetch: watches the throw, runs to the ball, brings it back", () => {
    const pet = ask("fetch", { to: { x: -2, z: 1 } });
    expect(dogAt(pet, world, at + 300).ball.y).toBeGreaterThan(0.3); // in the air
    const running = dogAt(pet, world, at + 1500);
    expect(running.anim).toBe("run");
    let carried = false;
    let end = null;
    for (let t = at; t < busyUntil(pet, world); t += 200) {
      const s = dogAt(pet, world, t);
      carried ||= s.carrying;
      end = s;
    }
    expect(carried).toBe(true);
    expect(Math.hypot(end.x - 1.5, end.z - 2.5)).toBeLessThan(0.7);
  });

  it("eats at its bowl, and naps in its house at bedtime", () => {
    const fed = ask("feed");
    const eating = dogAt(fed, world, at + 9000);
    expect(eating.anim).toBe("eat");
    expect(Math.hypot(eating.x - -2.6, eating.z - 3.5)).toBeLessThan(0.7);
    const sleep = ask("sleep");
    const napping = dogAt(sleep, world, at + 15_000);
    expect(napping.pose).toBe("sleep");
    expect(Math.hypot(napping.x - -3.6, napping.z - 3.2)).toBeLessThan(1);
  });

  it("puts real food down: kibble in the bowl that empties as it eats, a biscuit that gets smaller", () => {
    const fed = ask("feed");
    const walkingOver = dogAt(fed, world, at + 1000);
    expect(walkingOver.food).toMatchObject({ kind: "kibble", inBowl: true, amount: 1 });
    expect(Math.hypot(walkingOver.food.x - -2.6, walkingOver.food.z - 3.5)).toBeLessThan(0.15); // in the bowl
    const amounts = [];
    for (let t = at; t < busyUntil(fed, world); t += 500) {
      const s = dogAt(fed, world, t);
      if (s.anim === "eat") amounts.push(s.food.amount);
    }
    expect(amounts.length).toBeGreaterThan(10);
    expect(amounts.every((a, i) => i === 0 || a <= amounts[i - 1])).toBe(true); // only ever goes down
    expect(amounts.at(-1)).toBeLessThan(0.1);
    expect(dogAt(fed, world, busyUntil(fed, world) + 100).food).toBeNull(); // empty bowl again

    const treat = ask("treat");
    let first = null;
    let last = null;
    for (let t = at; t < busyUntil(treat, world); t += 200) {
      const s = dogAt(treat, world, t);
      if (s.food) {
        first ??= s;
        last = s;
      }
    }
    expect(first.food).toMatchObject({ kind: "treat", amount: 1 });
    expect(last.food.amount).toBeLessThan(0.15);
  });

  it("grows from a puppy into a grown dog over about two months", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    const day = 86_400_000;
    expect(growthOf(now, now)).toMatchObject({ stage: "puppy", size: 0.6, head: 1.2 });
    expect(growthOf(now - 30 * day, now)).toMatchObject({ stage: "growing" });
    expect(growthOf(now - 30 * day, now).size).toBeCloseTo(0.8, 2);
    expect(growthOf(now - 90 * day, now)).toMatchObject({ stage: "grown", size: 1, head: 1, label: "3 months old" });
    expect(growthOf(null, now).stage).toBe("puppy"); // before it has a row: a brand-new puppy
  });

  it("is petted with hearts and a happy tail", () => {
    const s = dogAt(ask("pet"), world, at + 4000);
    expect(s).toMatchObject({ anim: "petted", hearts: true, wag: 1 });
  });

  it("says how it feels", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(moodOf({ fedAt: "2026-10-21T12:00:00Z" }, now).id).toBe("hungry");
    expect(moodOf({ fedAt: "2026-10-22T11:00:00Z", playedAt: "2026-10-22T11:00:00Z", pettedAt: "2026-10-22T11:00:00Z" }, now).id).toBe("happy");
  });
});
