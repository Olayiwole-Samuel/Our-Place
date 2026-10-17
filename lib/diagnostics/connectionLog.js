/**
 * A short, local log of what happened to this tab's live connections — the
 * realtime socket, the presence channel, voice and the 3D scene — so a drop on
 * a real phone can be explained afterwards ("Connection log" in the account
 * menu → Copy). Kept in memory and sessionStorage only (survives a reload in
 * the same tab, never leaves the device unless the user copies it). Holds no
 * message content, names or ids — just event kinds and timings.
 */
const MAX_ENTRIES = 80;
const STORAGE_KEY = "our-place:connection-log";
let entries = null;
const listeners = new Set();

function load() {
  if (entries) return entries;
  try {
    entries = JSON.parse(globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(entries)) entries = [];
  } catch {
    entries = [];
  }
  return entries;
}

/** Record one event, e.g. logConnection("presence", "channel error"). */
export function logConnection(area, event) {
  const list = load();
  list.push({ at: Date.now(), area, event: String(event).slice(0, 120) });
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  entries = list.slice();
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or blocked: memory is enough
  }
  listeners.forEach((listener) => listener());
}

export function connectionLog() {
  return load();
}

export function subscribeConnectionLog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Plain text for pasting into a message. */
export function formatConnectionLog(list = load(), env = {}) {
  const lines = list.map(({ at, area, event }) => `${new Date(at).toISOString().slice(11, 19)} ${area.padEnd(8)} ${event}`);
  const head = [
    `Our Place connection log — ${new Date().toISOString()}`,
    env.userAgent ? `Device: ${env.userAgent}` : null,
    env.online === undefined ? null : `Online: ${env.online}  Visible: ${env.visible}`,
  ].filter(Boolean);
  return [...head, ...lines].join("\n");
}
