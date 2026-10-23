import { describe, expect, it, vi } from "vitest";
import { POSE_SEND_HZ, createPoseScheduler, joinCouplePresence, sanitizePose } from "./couplePresence";

const bounds = { minX: -4.5, maxX: 4.5, minZ: -4, maxZ: 4 };
const COUPLE = "2f1c0a9e-6a8b-4c3d-9e2f-1a2b3c4d5e6f";
const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";

/** In-memory stand-in for a Supabase Realtime channel. */
function fakeSupabase() {
  const listeners = [];
  let presence = {};
  let subscribeCallback;
  const channel = {
    on: (type, filter, cb) => {
      listeners.push({ type, event: filter.event, cb });
      return channel;
    },
    subscribe: (cb) => {
      subscribeCallback = cb;
      return channel;
    },
    presenceState: () => presence,
    track: vi.fn(async () => "ok"),
    untrack: vi.fn(async () => "ok"),
    send: vi.fn(async () => "ok"),
  };
  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => {}),
    realtime: { setAuth: vi.fn(async () => {}) },
  };
  return {
    supabase,
    channel,
    status: (s) => subscribeCallback(s),
    setPresence: (state) => {
      presence = state;
      listeners.filter((l) => l.type === "presence" && l.event === "sync").forEach((l) => l.cb());
    },
    broadcast: (event, payload) => listeners.filter((l) => l.type === "broadcast" && l.event === event).forEach((l) => l.cb({ payload })),
  };
}

const handlers = () => ({ onConnection: vi.fn(), onPartnerSync: vi.fn(), onPartnerPose: vi.fn(), onPartnerLeft: vi.fn() });
const pose = { x: 0, z: 2, ry: 0, anim: "idle" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function connect() {
  const fake = fakeSupabase();
  const h = handlers();
  const presence = joinCouplePresence({ supabase: fake.supabase, coupleId: COUPLE, userId: ME, partnerId: PARTNER, bounds, initialPose: pose, handlers: h });
  await flush();
  fake.status("SUBSCRIBED");
  return { fake, h, presence };
}

describe("couple presence channel", () => {
  it("opens a PRIVATE, couple-scoped channel keyed by the user, after refreshing auth", async () => {
    const { fake } = await connect();
    expect(fake.supabase.realtime.setAuth).toHaveBeenCalled();
    expect(fake.supabase.channel).toHaveBeenCalledWith(`our-place:couple:${COUPLE}:presence`, {
      config: { private: true, presence: { key: ME }, broadcast: { self: false, ack: false } },
    });
  });

  it("tracks only pose data — no names, emails or tokens", async () => {
    const { fake } = await connect();
    const [meta] = fake.channel.track.mock.calls[0];
    expect(Object.keys(meta).sort()).toEqual(["at", "pose", "v"]);
    expect(Object.keys(meta.pose).sort()).toEqual(["anim", "room", "ry", "x", "z"]); // which room, never who
  });

  it("reports the partner only when presence contains the partner's key", async () => {
    const { fake, h } = await connect();
    fake.setPresence({ [ME]: [{ pose }] });
    expect(h.onPartnerSync).toHaveBeenLastCalledWith({ present: false, pose: null });
    fake.setPresence({ [ME]: [{ pose }], [PARTNER]: [{ pose: { x: 1, z: 1, ry: 0, anim: "idle" }, at: 1 }] });
    expect(h.onPartnerSync).toHaveBeenLastCalledWith({ present: true, pose: { x: 1, z: 1, ry: 0, anim: "idle", room: "living_room" } });
  });

  it("ignores presence entries that are not the partner", async () => {
    const { fake, h } = await connect();
    fake.setPresence({ "someone-else": [{ pose }] });
    expect(h.onPartnerSync).toHaveBeenLastCalledWith({ present: false, pose: null });
  });

  it("sanitises streamed poses and drops garbage", async () => {
    const { fake, h } = await connect();
    fake.broadcast("pose", { x: 999, z: -999, ry: 0, anim: "moonwalk" });
    expect(h.onPartnerPose).toHaveBeenLastCalledWith({ x: 4.5, z: -4, ry: 0, anim: "idle", room: "living_room" });
    fake.broadcast("pose", { x: "1; drop", z: 0, ry: 0 });
    expect(h.onPartnerPose).toHaveBeenCalledTimes(1);
  });

  it("reflects connection state and re-tracks after reconnecting", async () => {
    const { fake, h } = await connect();
    expect(h.onConnection).toHaveBeenLastCalledWith("live");
    fake.status("CHANNEL_ERROR");
    expect(h.onConnection).toHaveBeenLastCalledWith("reconnecting");
    fake.status("SUBSCRIBED");
    expect(h.onConnection).toHaveBeenLastCalledWith("live");
    expect(fake.channel.track).toHaveBeenCalledTimes(2);
  });

  it("does not send while disconnected", async () => {
    const { fake, presence } = await connect();
    fake.status("TIMED_OUT");
    presence.updatePose({ x: 1, z: 1, ry: 0, anim: "walk" }, 1000);
    expect(fake.channel.send).not.toHaveBeenCalled();
  });

  it("says goodbye, untracks and removes the channel on leave", async () => {
    const { fake, presence } = await connect();
    await presence.leave();
    expect(fake.channel.send).toHaveBeenCalledWith({ type: "broadcast", event: "leave", payload: {} });
    expect(fake.channel.untrack).toHaveBeenCalled();
    expect(fake.supabase.removeChannel).toHaveBeenCalledWith(fake.channel);
  });

  it("forwards the partner's deliberate leave", async () => {
    const { fake, h } = await connect();
    fake.broadcast("leave", {});
    expect(h.onPartnerLeft).toHaveBeenCalled();
  });

  it("carries chat typing both ways, as a plain on/off", async () => {
    const { fake, h, presence } = await connect();
    h.onPartnerTyping = vi.fn();
    presence.sendTyping(true);
    presence.sendTyping("junk");
    expect(fake.channel.send.mock.calls.map(([message]) => message)).toEqual([
      { type: "broadcast", event: "typing", payload: { on: true } },
      { type: "broadcast", event: "typing", payload: { on: false } },
    ]);
    fake.broadcast("typing", { on: true });
    fake.broadcast("typing", { on: "<script>" });
    expect(h.onPartnerTyping.mock.calls).toEqual([[true], [false]]);
  });
});

describe("rooms", () => {
  it("says which room each of you is in, checked and fitted to that room", async () => {
    const { sanitizePose } = await import("./couplePresence");
    const bounds = (room) => (room === "hallway" ? { minX: -1.4, maxX: 1.4, minZ: -4.5, maxZ: 4.5 } : { minX: -4.5, maxX: 4.5, minZ: -4, maxZ: 4 });
    expect(sanitizePose({ x: 3, z: 0, ry: 0, anim: "walk", room: "hallway" }, bounds)).toMatchObject({ room: "hallway", x: 1.4 });
    expect(sanitizePose({ x: 3, z: 0, ry: 0, anim: "walk", room: "<script>" }, bounds)).toMatchObject({ room: "living_room", x: 3 });
    expect(sanitizePose({ x: 3, z: 0, ry: 0, anim: "walk" }, bounds).room).toBe("living_room"); // older clients
  });
});

describe("pose scheduling", () => {
  it(`streams movement at most ${POSE_SEND_HZ} times per second`, () => {
    const scheduler = createPoseScheduler();
    let sent = 0;
    // 60 fps of continuous walking for one second.
    for (let frame = 0; frame < 60; frame++) {
      if (scheduler.next({ x: frame * 0.05, z: 0, ry: 0, anim: "walk" }, frame * (1000 / 60)).broadcast) sent++;
    }
    expect(sent).toBeLessThanOrEqual(POSE_SEND_HZ);
    expect(sent).toBeGreaterThanOrEqual(POSE_SEND_HZ - 1);
  });

  it("keeps streaming when the caller mutates one pose object in place (as the world runtime does)", () => {
    const scheduler = createPoseScheduler();
    const live = { x: 0, z: 0, ry: 0, anim: "walk" };
    let sent = 0;
    for (let frame = 0; frame < 60; frame++) {
      live.x = frame * 0.05;
      if (scheduler.next(live, frame * (1000 / 60)).broadcast) sent++;
    }
    expect(sent).toBeGreaterThanOrEqual(POSE_SEND_HZ - 1);
    // …and settling re-tracks the final resting pose.
    live.anim = "idle";
    expect(scheduler.next(live, 5000).track).toMatchObject({ x: live.x, anim: "idle" });
  });

  it("sends nothing while standing still", () => {
    const scheduler = createPoseScheduler();
    scheduler.next(pose, 0);
    let sent = 0;
    for (let t = 200; t < 5000; t += 16) if (scheduler.next(pose, t).broadcast) sent++;
    expect(sent).toBe(0);
  });

  it("re-tracks presence when the player settles, not while walking", () => {
    const scheduler = createPoseScheduler();
    expect(scheduler.next({ x: 1, z: 0, ry: 0, anim: "walk" }, 0).track).toBeNull();
    expect(scheduler.next({ x: 1.2, z: 0, ry: 0, anim: "idle" }, 2000).track).toEqual({ x: 1.2, z: 0, ry: 0, anim: "idle", room: "living_room" });
  });
});

describe("sanitizePose", () => {
  it("rejects non-objects and non-finite numbers", () => {
    expect(sanitizePose(null, bounds)).toBeNull();
    expect(sanitizePose({ x: NaN, z: 0, ry: 0 }, bounds)).toBeNull();
    expect(sanitizePose({ x: Infinity, z: 0, ry: 0 }, bounds)).toBeNull();
  });
});
