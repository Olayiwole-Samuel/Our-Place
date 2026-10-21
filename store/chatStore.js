"use client";

import { create } from "zustand";
import { RATE_LIMIT, canReplyTo, chatErrorCode, mergeMessages, missingReplies, newestConfirmed, validateMessage } from "@/lib/chat/messages";
import { TYPING, createTypingGate } from "@/lib/chat/typing";

/**
 * Couple chat state. The database is the source of truth; this store holds the
 * loaded window of it plus local sending state. The Supabase side lives in
 * lib/chat/chatService.js (attached by useCoupleChat while the world is open).
 *
 *   status        "idle" | "loading" | "ready" | "error"   (history load)
 *   connection    realtime delivery: "connecting" | "live" | "reconnecting" | "closed"
 *   messages      ordered by created_at; each { id, senderId, type, content, clientId,
 *                 replyTo, createdAt, status: "sent" | "sending" | "failed", local? }
 *   hasOlder      more history exists above the loaded window
 *   open, unread  panel state; unread counts partner messages while closed
 *   replies       the database supports replies (false until its migration is applied)
 *   replyingTo    the message the composer is answering, or null
 *   quoted        originals of replies that aren't in the loaded window, fetched by
 *                 id: id → message, or null when it no longer exists
 *   partnerTyping the partner is typing right now (live, from the presence topic)
 *
 * Module-level (like worldStore): written only from browser effects/handlers.
 */
const initialState = {
  status: "idle",
  connection: "connecting",
  messages: [],
  hasOlder: false,
  loadingOlder: false,
  open: false,
  unread: 0,
  error: null,
  replies: true,
  replyingTo: null,
  quoted: {},
  partnerTyping: false,
};

let service = null;
let me = null;
let seenKey = null;
let attachedCouple = null;
let recentSends = [];
let quoting = new Set(); // ids being fetched
let sendTyping = null; // (on) => void, bound by the presence channel
let typingGate = createTypingGate();
let typingIdle = null;
let partnerTypingExpiry = null;

const readSeen = () => {
  try {
    return Number(window.localStorage.getItem(seenKey)) || 0;
  } catch {
    return 0;
  }
};
const writeSeen = (micros) => {
  try {
    window.localStorage.setItem(seenKey, String(micros));
  } catch {
    // Private mode etc.: unread simply isn't remembered across reloads.
  }
};
const isFromPartner = (message) => message.senderId && message.senderId !== me && message.type === "text";
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const clearTimers = () => {
  clearTimeout(typingIdle);
  clearTimeout(partnerTypingExpiry);
  typingIdle = null;
  partnerTypingExpiry = null;
};
const forget = () => {
  service = null;
  recentSends = [];
  quoting = new Set();
  typingGate = createTypingGate();
  clearTimers();
};

export const useChatStore = create((set, get) => ({
  ...initialState,

  /** Called by useCoupleChat once the service is open. */
  async attach(nextService, { userId, coupleId }) {
    service = nextService;
    me = userId;
    attachedCouple = coupleId;
    seenKey = `our-place:chat-seen:${coupleId}`;
    quoting = new Set();
    set({ ...initialState, status: "loading", connection: get().connection, open: get().open, partnerTyping: get().partnerTyping });
    try {
      const { messages, hasOlder, replies } = await service.loadPage();
      if (service !== nextService) return;
      const lastSeen = readSeen();
      const merged = mergeMessages(get().messages, messages);
      set({
        status: "ready",
        messages: merged,
        hasOlder,
        replies: replies !== false,
        unread: get().open ? 0 : merged.filter((message) => isFromPartner(message) && message.micros > lastSeen).length,
      });
      if (get().open) get().markSeen();
      get().resolveQuotes();
    } catch (error) {
      if (service === nextService) set({ status: "error", error: error.code ?? "unknown" });
    }
  },

  retryLoad() {
    if (service) get().attach(service, { userId: me, coupleId: attachedCouple });
  },

  detach() {
    forget();
    set(initialState);
  },

  setConnection: (connection) => set({ connection }),

  /** A confirmed message from realtime or catch-up (deduplicated by id). */
  receive(incoming) {
    const list = [].concat(incoming);
    const before = get().messages;
    const known = new Set(before.map((message) => message.id));
    const fresh = list.filter((message) => !known.has(message.id));
    if (!fresh.length) return [];
    set({ messages: mergeMessages(before, fresh) });
    const fromPartner = fresh.filter(isFromPartner);
    if (fromPartner.length) {
      get().setPartnerTyping(false); // they sent it, so they've stopped typing
      if (get().open && typeof document !== "undefined" && document.visibilityState === "visible") get().markSeen();
      else set({ unread: get().unread + fromPartner.length });
    }
    get().resolveQuotes();
    return fromPartner;
  },

  async catchUp() {
    if (!service) return;
    try {
      const rows = await service.catchUp(newestConfirmed(get().messages.filter((message) => !message.local)));
      if (rows.length) get().receive(rows);
    } catch {
      // Next reconnect tries again; nothing is lost (the database has it).
    }
  },

  async loadOlder() {
    const { hasOlder, loadingOlder, messages } = get();
    if (!service || !hasOlder || loadingOlder) return;
    const oldest = messages.find((message) => message.status === "sent" && !message.local);
    if (!oldest) return;
    set({ loadingOlder: true });
    try {
      const page = await service.loadPage(oldest);
      set({ messages: mergeMessages(get().messages, page.messages), hasOlder: page.hasOlder, loadingOlder: false });
      get().resolveQuotes();
    } catch {
      set({ loadingOlder: false });
    }
  },

  /**
   * Fetches the originals of replies that point outside the loaded window, so
   * their quotes can show. One request per batch; a failure is retried the next
   * time messages change.
   */
  async resolveQuotes() {
    if (!service?.loadByIds || !get().replies) return;
    const ids = missingReplies(get().messages, get().quoted).filter((id) => !quoting.has(id));
    if (!ids.length) return;
    const current = service;
    ids.forEach((id) => quoting.add(id));
    try {
      const found = await current.loadByIds(ids);
      if (service !== current) return;
      const byId = new Map(found.map((message) => [message.id, message]));
      set({ quoted: { ...get().quoted, ...Object.fromEntries(ids.map((id) => [id, byId.get(id) ?? null])) } });
    } catch {
      // Quotes show "loading" until a later attempt succeeds.
    } finally {
      ids.forEach((id) => quoting.delete(id));
    }
  },

  /** Swipe (or the reply button) on a message: the composer now answers it. */
  startReply(message) {
    if (!get().replies || !canReplyTo(message)) return false;
    set({ replyingTo: message });
    return true;
  },

  cancelReply() {
    if (get().replyingTo) set({ replyingTo: null });
  },

  /**
   * Optimistic send: the message shows as "sending" immediately and becomes the
   * saved row (same clientId) once the database confirms — or "failed" with a
   * Retry. Never shown as sent unless the database has it. A reply being
   * composed is attached and the composer's quote is cleared.
   * Returns null on success or an error code for the composer.
   */
  async sendMessage(raw) {
    const check = validateMessage(raw);
    if (!check.ok) return check.reason;
    const now = Date.now();
    recentSends = recentSends.filter((at) => now - at < RATE_LIMIT.windowMs);
    if (recentSends.length >= RATE_LIMIT.count) return "rate_limited";
    recentSends.push(now);

    const clientId = newId();
    const pending = {
      id: `local:${clientId}`,
      senderId: me,
      type: "text",
      content: check.text,
      clientId,
      replyTo: get().replies ? (get().replyingTo?.id ?? null) : null,
      createdAt: now,
      micros: now * 1000,
      status: "sending",
    };
    set({ messages: [...get().messages, pending], replyingTo: null });
    get().stopTyping();
    await get().deliver(clientId);
    return null;
  },

  async deliver(clientId) {
    const pending = get().messages.find((message) => message.clientId === clientId && message.status !== "sent");
    if (!pending) return;
    if (!service) {
      set({ messages: get().messages.map((message) => (message === pending ? { ...message, status: "failed", error: "network" } : message)) });
      return;
    }
    try {
      const saved = await service.send(pending.content, clientId, pending.replyTo ?? null);
      set({ messages: mergeMessages(get().messages, [saved]) });
      // A phone notification for the partner if they're not in Our Place (the server decides).
      if (saved?.id) import("@/lib/push/client").then(({ announceMessage }) => announceMessage(saved.id)).catch(() => {});
    } catch (error) {
      const code = error.code ?? chatErrorCode(error);
      set({
        messages: get().messages.map((message) => (message.clientId === clientId && message.status !== "sent" ? { ...message, status: "failed", error: code } : message)),
      });
    }
  },

  /** Retry a failed send. If the original it replied to is gone, it's sent without the quote. */
  retry(clientId) {
    set({
      messages: get().messages.map((message) =>
        message.clientId === clientId && message.status === "failed"
          ? { ...message, status: "sending", error: null, replyTo: message.error === "invalid_reply" ? null : message.replyTo }
          : message,
      ),
    });
    return get().deliver(clientId);
  },

  discard(clientId) {
    set({ messages: get().messages.filter((message) => !(message.clientId === clientId && message.status === "failed")) });
  },

  /**
   * A local, unsaved system line (partner arrived/left). Shown in the feed for
   * context; not persisted, so history isn't filled with presence noise.
   */
  addNotice(content) {
    const now = Date.now();
    const notice = { id: `notice:${newId()}`, senderId: null, type: "system", content, clientId: null, replyTo: null, createdAt: now, micros: now * 1000, status: "sent", local: true };
    set({ messages: mergeMessages(get().messages, [notice]) });
  },

  // ── Typing ("… is typing"), over the presence topic ──────────────────────

  /** The presence channel's sender (null when it closes). */
  bindTyping(sender) {
    sendTyping = sender;
    typingGate = createTypingGate();
    clearTimeout(typingIdle);
    if (!sender) get().setPartnerTyping(false);
  },

  /** The composer's draft changed. Tells the partner we're typing — sparingly. */
  noteTyping(draft) {
    const hasText = typeof draft === "string" && draft.trim().length > 0;
    const send = typingGate.input(hasText, Date.now());
    if (send !== null) sendTyping?.(send);
    clearTimeout(typingIdle);
    typingIdle = hasText ? setTimeout(() => get().stopTyping(), TYPING.idleMs) : null;
  },

  /** Sent, cleared, closed or idle: the partner's indicator goes away. */
  stopTyping() {
    clearTimeout(typingIdle);
    typingIdle = null;
    if (typingGate.stop() === false) sendTyping?.(false);
  },

  /** From the partner. A "typing" without a refresh expires on its own. */
  setPartnerTyping(on) {
    clearTimeout(partnerTypingExpiry);
    partnerTypingExpiry = on ? setTimeout(() => set({ partnerTyping: false }), TYPING.expireMs) : null;
    if (get().partnerTyping !== on) set({ partnerTyping: on });
  },

  setOpen(open) {
    set({ open });
    if (open) get().markSeen();
    else get().stopTyping();
  },

  markSeen() {
    const newest = newestConfirmed(get().messages.filter((message) => !message.local));
    if (newest && seenKey) writeSeen(newest.micros);
    if (get().unread) set({ unread: 0 });
  },

  reset: () => {
    forget();
    sendTyping = null;
    set(initialState);
  },
}));
