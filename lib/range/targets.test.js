import { describe, expect, it } from "vitest";
import { LANES, LANE_HALF_WIDTH, ROUND_MS, multiplier, ringPoints, roundPlan, shoot, targetAt } from "./targets";

describe("the range", () => {
  it("plans a busy, fair round inside your lane", () => {
    const plan = roundPlan(1234, 1);
    expect(plan.length).toBeGreaterThan(25);
    expect(roundPlan(1234, 1)).toEqual(plan); // same seed, same round
    for (const target of plan) {
      expect(target.at).toBeLessThan(ROUND_MS);
      expect(Math.abs(target.x - LANES[1]) + target.sway / 2).toBeLessThanOrEqual(LANE_HALF_WIDTH);
      expect(target.z).toBeLessThan(-2);
      expect(target.z).toBeGreaterThan(-5.4); // in front of the berm
    }
    expect(new Set(plan.map((t) => t.kind))).toEqual(new Set(["plate", "mover", "gold"]));
  });

  it("scores rings, doubles gold, and builds a streak multiplier", () => {
    const plate = { kind: "plate", radius: 0.2 };
    expect([0, 0.04, 0.1, 0.19, 0.25].map((d) => ringPoints(plate, d))).toEqual([10, 10, 7, 4, 0]);
    expect(ringPoints({ kind: "gold", radius: 0.13 }, 0)).toBe(20);
    expect([0, 2, 3, 5, 6, 20].map(multiplier)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("hits what you aim at — only while it's up, only once, nearest first", () => {
    const plan = [
      { id: 1, kind: "plate", at: 0, life: 3000, x: 0, y: 1.2, z: -5, radius: 0.2, sway: 0, speed: 0 },
      { id: 2, kind: "plate", at: 0, life: 3000, x: 0, y: 1.2, z: -8, radius: 0.2, sway: 0, speed: 0 },
    ];
    const eye = { x: 0, y: 1.2, z: 1.8 };
    const ahead = { x: 0, y: 0, z: -1 };
    const first = shoot(plan, new Set(), 500, eye, ahead);
    expect(first).toMatchObject({ hit: true, points: 10, bullseye: true });
    expect(first.target.id).toBe(1); // the nearer one
    expect(shoot(plan, new Set([1]), 500, eye, ahead).target.id).toBe(2);
    expect(shoot(plan, new Set(), 4000, eye, ahead)).toEqual({ hit: false }); // both down by then
    const wide = { x: 0.2, y: 0, z: -1 };
    const len = Math.hypot(wide.x, wide.z);
    expect(shoot(plan, new Set(), 500, eye, { x: wide.x / len, y: 0, z: wide.z / len })).toEqual({ hit: false });
  });

  it("moves movers side to side", () => {
    const mover = { id: 1, kind: "mover", at: 0, life: 4000, x: 0, y: 1, z: -5, radius: 0.2, sway: 0.6, speed: 1 };
    const xs = [0, 500, 1000, 1500].map((t) => targetAt(mover, t).x);
    expect(new Set(xs.map((x) => x.toFixed(2))).size).toBeGreaterThan(2);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(0.3 + 1e-9);
  });
});
