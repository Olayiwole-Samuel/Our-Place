/**
 * Chat message rules shared by the store, the realtime layer and the UI.
 * Mirrors the database (supabase/migrations/20261007000000_chat_and_emotes.sql and
 * 20261021000000_chat_replies.sql), which remains the authority: these checks
 * only give instant feedback.
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
 * Shape: { id, senderId, type, content, clientId, replyTo, createdAt (ms), status: "sent" }
 * replyTo is the id of the message this one answers, or null.
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
    replyTo: UUID.test(row.reply_to ?? "") && row.reply_to !== row.id ? row.reply_to : null,
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

// ── Replies ──────────────────────────────────────────────────────────────────

export const QUOTE_LENGTH = 90;

/** One line of the original for a quote: whitespace collapsed, cut at a character (not mid-emoji). */
export function quoteSnippet(content, max = QUOTE_LENGTH) {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : text;
}

/** Only saved text messages can be answered (a pending one has no database id yet). */
export function canReplyTo(message) {
  return Boolean(message && message.type === "text" && message.status === "sent" && !message.local && UUID.test(message.id ?? ""));
}

/**
 * The quoted original of a reply, for display:
 *   null                         not a reply
 *   { id, state: "loading" }     the original isn't loaded yet
 *   { id, state: "missing" }     the original is gone (deleted)
 *   { id, state: "ready", senderId, snippet }
 * `quoted` caches originals fetched by id (id → message, or null when not found).
 */
export function resolveReply(message, byId, quoted = {}) {
  const id = message?.replyTo;
  if (!id) return null;
  const original = byId.get(id) ?? quoted[id];
  if (original === undefined) return { id, state: "loading" };
  if (original === null) return { id, state: "missing" };
  return { id, state: "ready", senderId: original.senderId, snippet: quoteSnippet(original.content) };
}

/** Ids of originals that replies point at but that aren't loaded or cached yet. */
export function missingReplies(messages, quoted = {}) {
  const loaded = new Set(messages.map((message) => message.id));
  const missing = new Set();
  for (const message of messages) {
    if (message.replyTo && !loaded.has(message.replyTo) && !(message.replyTo in quoted)) missing.add(message.replyTo);
  }
  return [...missing];
}

/** The database doesn't have replies yet (the migration isn't applied): a missing column or argument. */
export function isMissingReplySupport(error) {
  const message = error?.message ?? "";
  return /reply_to/.test(message) && (error?.code === "42703" || /^PGRST20[24]$/.test(error?.code ?? "") || /does not exist|could not find/i.test(message));
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
  invalid_reply: "The message you replied to is gone. Retry sends it without the quote.",
  unknown: "Message failed to send.",
};
