import { describe, expect, it, vi } from "vitest";
import { REJOIN_MAX_MS, openResilientChannel } from "./resilientChannel";

/** A fake supabase whose channels report statuses when the test says so. */
function fakeSupabase() {
  const channels = [];
  const supabase = {
    realtime: { setAuth: vi.fn(async () => {}) },
    channel: vi.fn((topic, options) => {
      const channel = { topic, options, listeners: [], status: null, on: vi.fn((...args) => channel.listeners.push(args) && channel), subscribe: vi.fn((cb) => (channel.status = cb)) };
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn(async () => "ok"),
  };
  return { supabase, channels };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const { supabase, channels } = fakeSupabase();
  const timers = [];
  const statuses = [];
  const handle = openResilientChannel({
    supabase,
    topic: "couple:c:presence",
    options: { config: { private: true } },
    bind: (channel) => channel.on("broadcast", { event: "x" }, () => {}),
    onStatus: (status) => statuses.push(status),
    log: () => {},
    schedule: (fn, ms) => timers.push({ fn, ms }) && timers.length,
    cancel: vi.fn(),
  });
  return { supabase, channels, timers, statuses, handle };
}

describe("openResilientChannel", () => {
  it("joins with a fresh token and binds listeners", async () => {
    const { supabase, channels, statuses, handle } = setup();
    await flush();
    expect(supabase.realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(channels[0].listeners).toHaveLength(1);
    channels[0].status("SUBSCRIBED");
    expect(statuses).toEqual(["SUBSCRIBED"]);
    expect(handle.channel).toBe(channels[0]);
  });

  it("a channel the server closes is rebuilt (new token, listeners re-bound) after a backoff", async () => {
    const { supabase, channels, timers, statuses, handle } = setup();
    await flush();
    channels[0].status("SUBSCRIBED");
    channels[0].status("CLOSED");
    expect(statuses).toEqual(["SUBSCRIBED", "CLOSED"]);
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    timers[0].fn();
    await flush();
    expect(channels).toHaveLength(2);
    expect(channels[1].listeners).toHaveLength(1);
    expect(supabase.realtime.setAuth).toHaveBeenCalledTimes(2);
    expect(handle.channel).toBe(channels[1]);
    channels[1].status("SUBSCRIBED");
    expect(statuses.at(-1)).toBe("SUBSCRIBED");
    channels[0].status("SUBSCRIBED"); // a stale channel's late callback is ignored
    expect(statuses).toHaveLength(3);
  });

  it("backs off 1s, 2s, 4s … up to 30s while closes keep coming; a join resets it", async () => {
    const { channels, timers } = setup();
    for (let i = 0; i < 7; i += 1) {
      await flush();
      channels.at(-1).status("CLOSED");
      timers.at(-1).fn();
    }
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000, 4000, 8000, 16000, REJOIN_MAX_MS, REJOIN_MAX_MS]);
    await flush();
    channels.at(-1).status("SUBSCRIBED");
    channels.at(-1).status("CLOSED");
    expect(timers.at(-1).ms).toBe(1000);
  });

  it("closing it ourselves removes the channel and never rejoins", async () => {
    const { supabase, channels, timers, statuses, handle } = setup();
    await flush();
    await handle.close();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channels[0]);
    channels[0].status("CLOSED");
    expect(timers).toHaveLength(0);
    expect(statuses).toEqual([]);
  });
});
