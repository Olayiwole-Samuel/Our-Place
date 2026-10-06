import { describe, expect, it } from "vitest";
import { isBlocked, moveWithCollisions } from "./collision";
import { createInputState, isTypingTarget } from "./input";
import { findNearestInteractable } from "./interactions";
import { createPoseBuffer, lerpAngle } from "./interpolation";
import { initialPartnerPresence, partnerPresenceReducer } from "./partnerPresence";
import { PLAYER_RADIUS, livingRoom, roomColliders, roomInteractables } from "./rooms/livingRoom";
import { TIME_OF_DAY, timeOfDayFor } from "./timeOfDay";
import { sitDown, standUp } from "./actions";
import { createWorldRuntime } from "./runtime";

const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
const box = { shape: "box", x: 0, z: 0, halfWidth: 1, halfDepth: 0.5 };
const world = { radius: 0.3, bounds, colliders: [box] };

describe("collision", () => {
  it("moves freely in open space", () => {
    expect(moveWithCollisions({ x: 3, z: 3 }, 0.5, -0.5, world)).toEqual({ x: 3.5, z: 2.5 });
  });

  it("stops at furniture and slides along it", () => {
    // Walking diagonally into the box's front face keeps the sideways motion.
    const next = moveWithCollisions({ x: 0, z: 1 }, 0.2, -0.4, world);
    expect(next.z).toBeCloseTo(0.8, 5);
    expect(next.x).toBeCloseTo(0.2, 5);
    expect(isBlocked(next, world)).toBe(false);
  });

  it("can never leave the room, however large the step", () => {
    const next = moveWithCollisions({ x: 4.5, z: 0 }, 50, 50, world);
    expect(next).toEqual({ x: 4.7, z: 4.7 });
  });

  it("escapes if somehow placed inside furniture", () => {
    const next = moveWithCollisions({ x: 0.1, z: 0.05 }, 0, 0, world);
    expect(isBlocked(next, world)).toBe(false);
  });

  it("collides with round objects", () => {
    const plant = { shape: "circle", x: 2, z: 2, radius: 0.4 };
    const next = moveWithCollisions({ x: 2, z: 3 }, 0, -0.5, { ...world, colliders: [plant] });
    expect(Math.hypot(next.x - 2, next.z - 2)).toBeCloseTo(0.7, 5);
  });
});

describe("living room layout", () => {
  const colliders = roomColliders(livingRoom);
  const env = { radius: PLAYER_RADIUS, bounds: livingRoom.bounds, colliders };

  it("spawn points are inside the room, clear of furniture and apart from each other", () => {
    const { 1: a, 2: b } = livingRoom.spawnPoints;
    expect(isBlocked(a, env)).toBe(false);
    expect(isBlocked(b, env)).toBe(false);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(PLAYER_RADIUS * 4);
  });

  it("every interaction point is reachable (inside the room, not inside furniture)", () => {
    for (const item of roomInteractables(livingRoom)) {
      const reachable = moveWithCollisions({ x: item.x, z: item.z }, 0, 0, env);
      expect(Math.hypot(reachable.x - item.x, reachable.z - item.z), item.id).toBeLessThan(item.radius);
    }
  });

  it("includes every required zone", () => {
    const types = new Set(livingRoom.objects.map((object) => object.type));
    for (const type of ["couch", "rug", "coffeeTable", "plant", "bookshelf", "photoWall", "videoScreen", "door", "messageBoard", "gameCorner"]) {
      expect(types.has(type), type).toBe(true);
    }
  });

  it("standing up from either seat lands in free space", () => {
    for (const slot of [1, 2]) {
      const runtime = createWorldRuntime(livingRoom, slot);
      expect(sitDown(runtime)).toBe(true);
      expect(runtime.localPose.anim).toBe("sit");
      expect(standUp(runtime)).toBe(true);
      expect(isBlocked(runtime.localPose, env), `slot ${slot}`).toBe(false);
    }
  });

  it("spawns each partner at their own point", () => {
    expect(createWorldRuntime(livingRoom, 1).localPose).toMatchObject(livingRoom.spawnPoints[1]);
    expect(createWorldRuntime(livingRoom, 2).localPose).toMatchObject(livingRoom.spawnPoints[2]);
  });

  it("couch seats are free spots facing the screen", () => {
    const couch = livingRoom.objects.find((object) => object.id === "couch");
    for (const seat of Object.values(couch.seats)) expect(seat.ry).toBeCloseTo(Math.PI);
  });
});

describe("interaction detection", () => {
  const items = [
    { id: "a", x: 0, z: 0, radius: 1 },
    { id: "b", x: 1.5, z: 0, radius: 1 },
  ];
  it("returns the nearest object in range, or null", () => {
    expect(findNearestInteractable({ x: 0.2, z: 0 }, items).id).toBe("a");
    expect(findNearestInteractable({ x: 1.2, z: 0 }, items).id).toBe("b");
    expect(findNearestInteractable({ x: 4, z: 4 }, items)).toBeNull();
  });
});

describe("pose interpolation", () => {
  it("blends between snapshots instead of teleporting", () => {
    const buffer = createPoseBuffer({ delayMs: 100 });
    buffer.push({ x: 0, z: 0, ry: 0, anim: "walk" }, 1000);
    buffer.push({ x: 1, z: 0, ry: 0, anim: "walk" }, 1100);
    const mid = buffer.sample(1150); // renders t=1050
    expect(mid.x).toBeCloseTo(0.5);
  });

  it("extrapolates briefly, then holds", () => {
    const buffer = createPoseBuffer({ delayMs: 100, maxExtrapolateMs: 100 });
    buffer.push({ x: 0, z: 0, ry: 0, anim: "walk" }, 1000);
    buffer.push({ x: 1, z: 0, ry: 0, anim: "walk" }, 1100);
    expect(buffer.sample(1250).x).toBeCloseTo(1.5);
    expect(buffer.sample(5000).x).toBeCloseTo(2); // capped
  });

  it("does not drift when the partner has stopped", () => {
    const buffer = createPoseBuffer({ delayMs: 100 });
    buffer.push({ x: 0, z: 0, ry: 0, anim: "walk" }, 1000);
    buffer.push({ x: 1, z: 0, ry: 0, anim: "idle" }, 1100);
    expect(buffer.sample(3000).x).toBe(1);
  });

  it("snaps on large jumps (e.g. sitting down across the room)", () => {
    const buffer = createPoseBuffer({ delayMs: 100, teleportDistance: 3 });
    buffer.push({ x: 0, z: 0, ry: 0, anim: "idle" }, 1000);
    buffer.push({ x: 5, z: 0, ry: 0, anim: "sit" }, 1100);
    expect(buffer.sample(1150)).toMatchObject({ x: 5, anim: "sit" });
  });

  it("turns the short way round", () => {
    expect(lerpAngle(0.1, Math.PI * 2 - 0.1, 0.5)).toBeCloseTo(0);
  });
});

describe("partner presence", () => {
  const run = (...events) => events.reduce(partnerPresenceReducer, initialPartnerPresence);

  it("is unknown until Realtime reports, never online by assumption", () => {
    expect(initialPartnerPresence.status).toBe("unknown");
    expect(run({ type: "sync", partnerPresent: false }).status).toBe("offline");
  });

  it("announces an arrival once", () => {
    const arrived = run({ type: "sync", partnerPresent: false }, { type: "sync", partnerPresent: true });
    expect(arrived).toMatchObject({ status: "online", announce: true });
    expect(partnerPresenceReducer(arrived, { type: "sync", partnerPresent: true }).announce).toBe(false);
  });

  it("announces a partner who was already here when we arrived", () => {
    expect(run({ type: "sync", partnerPresent: true })).toMatchObject({ status: "online", announce: true });
  });

  it("treats a dropped connection as 'away', then offline after the grace period", () => {
    const away = run({ type: "sync", partnerPresent: true }, { type: "sync", partnerPresent: false });
    expect(away.status).toBe("away");
    const back = partnerPresenceReducer(away, { type: "sync", partnerPresent: true });
    expect(back).toMatchObject({ status: "online", announce: false }); // quiet return
    expect(partnerPresenceReducer(away, { type: "grace_expired" }).status).toBe("offline");
  });

  it("an intentional leave is immediate", () => {
    expect(run({ type: "sync", partnerPresent: true }, { type: "partner_left" }).status).toBe("offline");
  });

  it("our own disconnect makes the partner unknown (not online)", () => {
    const state = run({ type: "sync", partnerPresent: true }, { type: "self_disconnected" });
    expect(state.status).toBe("unknown");
    // Reconnecting and finding them still here doesn't re-announce.
    expect(partnerPresenceReducer(state, { type: "sync", partnerPresent: true })).toMatchObject({ status: "online", announce: false });
  });
});

describe("input", () => {
  it("combines keys and joystick into a normalised vector", () => {
    const input = createInputState();
    input.pressKey("KeyW");
    input.pressKey("KeyD");
    const move = input.getMove();
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1);
    input.releaseAll();
    input.setJoystick(0.3, 0.4);
    expect(input.getMove()).toEqual({ x: 0.3, y: 0.4 });
  });

  it("ignores keys when typing in a field", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "CANVAS" })).toBe(false);
  });
});

describe("time of day", () => {
  it("maps local hours to presets", () => {
    expect(timeOfDayFor(new Date(2026, 0, 1, 8))).toBe(TIME_OF_DAY.morning);
    expect(timeOfDayFor(new Date(2026, 0, 1, 14))).toBe(TIME_OF_DAY.afternoon);
    expect(timeOfDayFor(new Date(2026, 0, 1, 19))).toBe(TIME_OF_DAY.evening);
    expect(timeOfDayFor(new Date(2026, 0, 1, 2))).toBe(TIME_OF_DAY.night);
  });
});

describe("camera occlusion geometry", () => {
  it("measures how close a prop is to the camera→player line", async () => {
    const { distanceToSegment } = await import("@/components/3d/World/CameraOccluder");
    // Camera at (0, 4), player at (0, 0): a prop at (0.2, 2) is in the way.
    expect(distanceToSegment(0.2, 2, 0, 4, 0, 0)).toEqual({ distance: expect.closeTo(0.2, 5), t: 0.5 });
    // A prop behind the player (beyond the segment) clamps to the player end (t = 1).
    expect(distanceToSegment(0, -1, 0, 4, 0, 0).t).toBe(1);
  });
});
