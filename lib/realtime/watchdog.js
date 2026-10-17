/**
 * Keeps the tab's Realtime connection alive on phones, where the OS freely
 * kills sockets: screen lock, app switch, Wi-Fi ↔ mobile data, a background
 * tab frozen for minutes. Everything live in Our Place (presence, chat,
 * emotes, voice signaling, game events) rides on this one socket, so a socket
 * that silently died leaves one partner looking "away" while they're in the room.
 *
 * Phoenix channels rejoin by themselves whenever the socket reopens, so
 * reviving the SOCKET is enough:
 *   - visible + online but not connected (e.g. the heartbeat worker failed,
 *     which makes the client disconnect for good) → connect()
 *   - back in the foreground after a while, or the network came back → probe:
 *     send a heartbeat; no reply within PROBE_TIMEOUT_MS → reconnect
 * Nothing runs while the page is hidden.
 */
export const CHECK_INTERVAL_MS = 15_000;
export const PROBE_TIMEOUT_MS = 5_000;
export const LONG_HIDDEN_MS = 10_000;

export function keepRealtimeAlive(realtime, { log = () => {}, doc = globalThis.document, win = globalThis.window, nav = globalThis.navigator, setTimer = setTimeout, clearTimer = clearTimeout, setRepeat = setInterval, clearRepeat = clearInterval, now = Date.now } = {}) {
  if (!realtime || !doc || !win) return () => {};
  let hiddenAt = null;
  let probeTimer = null;
  let reconnecting = false;

  const visible = () => doc.visibilityState === "visible";
  const online = () => nav?.onLine !== false;
  const connecting = () => (typeof realtime.isConnecting === "function" ? realtime.isConnecting() : realtime.connectionState?.() === "connecting");

  async function reconnect() {
    if (reconnecting) return;
    reconnecting = true;
    log("watchdog", "no heartbeat reply — rebuilding the socket");
    try {
      // A clean close marks the channels errored; they rejoin when the socket reopens.
      await Promise.resolve(realtime.disconnect?.()).catch(() => {});
      realtime.connect();
    } finally {
      reconnecting = false;
    }
  }

  function ensureConnected() {
    if (!visible() || !online()) return;
    if (!realtime.isConnected() && !connecting()) {
      log("watchdog", "socket down while visible — reconnecting");
      realtime.connect();
    }
  }

  function probe() {
    if (!visible() || !online()) return;
    if (!realtime.isConnected()) return ensureConnected();
    clearTimer(probeTimer);
    Promise.resolve(realtime.sendHeartbeat?.()).catch(() => {});
    const ref = realtime.pendingHeartbeatRef;
    if (!ref) return;
    probeTimer = setTimer(() => {
      // Still waiting for the very same heartbeat: the socket is dead.
      if (realtime.pendingHeartbeatRef === ref) reconnect();
    }, PROBE_TIMEOUT_MS);
  }

  const onVisibility = () => {
    if (!visible()) {
      hiddenAt = now();
      log("page", "hidden");
      return;
    }
    const away = hiddenAt === null ? 0 : now() - hiddenAt;
    hiddenAt = null;
    log("page", `visible again after ${Math.round(away / 1000)}s`);
    if (away >= LONG_HIDDEN_MS) probe();
    else ensureConnected();
  };
  const onOnline = () => {
    log("network", "back online");
    probe();
  };
  const onOffline = () => log("network", "offline");
  const onPageShow = (event) => (event?.persisted ? probe() : ensureConnected());

  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("online", onOnline);
  win.addEventListener("offline", onOffline);
  win.addEventListener("pageshow", onPageShow);
  const interval = setRepeat(ensureConnected, CHECK_INTERVAL_MS);

  return () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("online", onOnline);
    win.removeEventListener("offline", onOffline);
    win.removeEventListener("pageshow", onPageShow);
    clearRepeat(interval);
    clearTimer(probeTimer);
  };
}
