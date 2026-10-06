/**
 * Chat message rules shared by the store, the realtime layer and the UI.
 * Mirrors the database (supabase/migrations/20261007000000_chat_and_emotes.sql),
 * which remains the authority: these checks only give instant feedback.
 */
export const MAX_MESSAGE_LENGTH = 2000;
export const PAGE_SIZE = 50;
/** Client-side pacing; the server allows 8 per 10 s per sender. */
export const RATE_LIMIT = Object.freeze({ count: 8, windowMs: 10_000 });

const CONTROL_CHARS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Returns { ok: true, text } or { ok: false, reason: "empty" | "too_long" }. */
export function validateMessage(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const text = raw.replace(CONTROL_CHARS, "").replace(/^[\s]+|[\s]+$/g, "");
  if (!text) return { ok: false, reason: "empty" };
  if ([...text].length > MAX_MESSAGE_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true, text };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["text", "emote", "system"]);

/**
 * Coerces an untrusted row (realtime payload or REST row) into a message, or null.
 * Shape: { id, senderId, type, content, clientId, createdAt (ms), status: "sent" }
 */
export function toMessage(row) {
  if (!row || typeof row !== "object") return null;
  const createdAt = Date.parse(row.created_at);
  if (!UUID.test(row.id ?? "") || !TYPES.has(row.type) || typeof row.content !== "string" || !Number.isFinite(createdAt)) return null;
  return {
    id: row.id,
    senderId: typeof row.sender_id === "string" ? row.sender_id : null,
    type: row.type,
    content: row.content.slice(0, MAX_MESSAGE_LENGTH),
    clientId: typeof row.client_id === "string" ? row.client_id : null,
    createdAt,
    // Postgres keeps microseconds; ordering and keyset paging use them exactly.
    micros: toMicros(row.created_at, createdAt),
    cursor: row.created_at,
    status: "sent",
  };
}

function toMicros(text, ms) {
  const fraction = /\.(\d+)/.exec(text)?.[1] ?? "";
  const extra = Number((fraction.slice(3, 6) || "0").padEnd(3, "0"));
  return ms * 1000 + extra;
}

/** Database order: created_at (µs), then id. Never network arrival order. */
export function compareMessages(a, b) {
  return a.micros - b.micros || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Merges incoming confirmed messages into a list without duplicates:
 *  - the database id is canonical (same id → one message)
 *  - a confirmed message replaces the optimistic copy with the same clientId
 * Pending/failed local messages stay at the end, in the order they were sent.
 */
export function mergeMessages(list, incoming) {
  const byId = new Map();
  const confirmedClientIds = new Set();
  for (const message of [...list, ...incoming]) {
    if (message.status !== "sent") continue;
    byId.set(message.id, message);
    if (message.clientId) confirmedClientIds.add(message.clientId);
  }
  const confirmed = [...byId.values()].sort(compareMessages);
  const local = list.filter((message) => message.status !== "sent" && !confirmedClientIds.has(message.clientId));
  return [...confirmed, ...local];
}

/** Newest confirmed message (for catch-up after a reconnect). */
export function newestConfirmed(list) {
  for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].status === "sent") return list[i];
  return null;
}

/** Maps a database error ('chat:<reason>') to a stable code. */
export function chatErrorCode(error) {
  const match = /chat:([a-z_]+)/.exec(error?.message ?? "");
  if (match) return match[1];
  if (/fetch|network|Failed to fetch|timeout/i.test(error?.message ?? "")) return "network";
  return "unknown";
}

export const CHAT_ERROR_COPY = {
  empty: "Write something first.",
  too_long: `Messages can be up to ${MAX_MESSAGE_LENGTH.toLocaleString("en")} characters.`,
  rate_limited: "Slow down a little — try again in a moment.",
  not_paired: "Pair with your person first.",
  not_authenticated: "Your session ended. Sign in again to continue.",
  network: "Message failed to send. Check your connection.",
  unknown: "Message failed to send.",
};
