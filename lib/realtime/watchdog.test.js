import { describe, expect, it, vi } from "vitest";
import { CHECK_INTERVAL_MS, LONG_HIDDEN_MS, PROBE_TIMEOUT_MS, keepRealtimeAlive } from "./watchdog";

/** A fake page (document/window/navigator) and a fake Realtime client. */
function setup({ connected = true } = {}) {
  const listeners = { doc: {}, win: {} };
  const target = (bag) => ({
    addEventListener: (type, fn) => (bag[type] = fn),
    removeEventListener: (type) => delete bag[type],
  });
  const doc = { visibilityState: "visible", ...target(listeners.doc) };
  const win = target(listeners.win);
  const nav = { onLine: true };
  let time = 0;
  const timers = [];
  const realtime = {
    connected,
    pendingHeartbeatRef: null,
    isConnected: vi.fn(() => realtime.connected),
    isConnecting: vi.fn(() => false),
    connect: vi.fn(() => (realtime.connected = true)),
    disconnect: vi.fn(async () => (realtime.connected = false)),
    sendHeartbeat: vi.fn(() => (realtime.pendingHeartbeatRef = "hb-1")),
  };
  const stop = keepRealtimeAlive(realtime, {
    doc,
    win,
    nav,
    now: () => time,
    setTimer: (fn, ms) => timers.push({ fn, at: time + ms }) - 1,
    clearTimer: () => {},
    setRepeat: (fn) => ((realtime.tick = fn), 1),
    clearRepeat: () => {},
  });
  const advance = async (ms) => {
    time += ms;
    for (const timer of timers.splice(0)) if (timer.at <= time) await timer.fn();
  };
  const hide = () => ((doc.visibilityState = "hidden"), listeners.doc.visibilitychange());
  const show = () => ((doc.visibilityState = "visible"), listeners.doc.visibilitychange());
  return { realtime, listeners, nav, stop, advance, hide, show, setTime: (t) => (time = t) };
}

describe("realtime watchdog", () => {
  it("reconnects a socket that dropped while the page is visible (e.g. the heartbeat worker failed)", () => {
    const { realtime } = setup({ connected: false });
    realtime.tick();
    expect(realtime.connect).toHaveBeenCalledTimes(1);
    expect(CHECK_INTERVAL_MS).toBeLessThanOrEqual(15_000);
  });

  it("does nothing while hidden or offline", () => {
    const { realtime, hide, nav } = setup({ connected: false });
    hide();
    realtime.tick();
    expect(realtime.connect).not.toHaveBeenCalled();
    nav.onLine = false;
    realtime.tick();
    expect(realtime.connect).not.toHaveBeenCalled();
  });

  it("back from the background: probes the socket and rebuilds it when the heartbeat goes unanswered", async () => {
    const t = setup();
    t.hide();
    t.setTime(LONG_HIDDEN_MS + 5_000);
    t.show();
    expect(t.realtime.sendHeartbeat).toHaveBeenCalled();
    await t.advance(PROBE_TIMEOUT_MS);
    expect(t.realtime.disconnect).toHaveBeenCalled();
    expect(t.realtime.connect).toHaveBeenCalled();
  });

  it("a healthy socket answers the probe and is left alone", async () => {
    const t = setup();
    t.hide();
    t.setTime(LONG_HIDDEN_MS + 5_000);
    t.show();
    t.realtime.pendingHeartbeatRef = null; // the reply arrived
    await t.advance(PROBE_TIMEOUT_MS);
    expect(t.realtime.disconnect).not.toHaveBeenCalled();
  });

  it("network back → probe; a short glance away doesn't probe", () => {
    const t = setup();
    t.hide();
    t.setTime(2_000);
    t.show();
    expect(t.realtime.sendHeartbeat).not.toHaveBeenCalled();
    t.listeners.win.online();
    expect(t.realtime.sendHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("stops listening when stopped", () => {
    const t = setup();
    t.stop();
    expect(t.listeners.doc.visibilitychange).toBeUndefined();
    expect(t.listeners.win.online).toBeUndefined();
  });
});
