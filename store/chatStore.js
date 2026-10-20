"use client";

import { create } from "zustand";
import { RATE_LIMIT, chatErrorCode, mergeMessages, newestConfirmed, validateMessage } from "@/lib/chat/messages";

/**
 * Couple chat state. The database is the source of truth; this store holds the
 * loaded window of it plus local sending state. The Supabase side lives in
 * lib/chat/chatService.js (attached by useCoupleChat while the world is open).
 *
 *   status        "idle" | "loading" | "ready" | "error"   (history load)
 *   connection    realtime delivery: "connecting" | "live" | "reconnecting" | "closed"
 *   messages      ordered by created_at; each { id, senderId, type, content, clientId,
 *                 createdAt, status: "sent" | "sending" | "failed", local? }
 *   hasOlder      more history exists above the loaded window
 *   open, unread  panel state; unread counts partner messages while closed
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
};

let service = null;
let me = null;
let seenKey = null;
let attachedCouple = null;
let recentSends = [];

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

export const useChatStore = create((set, get) => ({
  ...initialState,

  /** Called by useCoupleChat once the service is open. */
  async attach(nextService, { userId, coupleId }) {
    service = nextService;
    me = userId;
    attachedCouple = coupleId;
    seenKey = `our-place:chat-seen:${coupleId}`;
    set({ ...initialState, status: "loading", connection: get().connection, open: get().open });
    try {
      const { messages, hasOlder } = await service.loadPage();
      if (service !== nextService) return;
      const lastSeen = readSeen();
      const merged = mergeMessages(get().messages, messages);
      set({
        status: "ready",
        messages: merged,
        hasOlder,
        unread: get().open ? 0 : merged.filter((message) => isFromPartner(message) && message.micros > lastSeen).length,
      });
      if (get().open) get().markSeen();
    } catch (error) {
      if (service === nextService) set({ status: "error", error: error.code ?? "unknown" });
    }
  },

  retryLoad() {
    if (service) get().attach(service, { userId: me, coupleId: attachedCouple });
  },

  detach() {
    service = null;
    recentSends = [];
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
      if (get().open && typeof document !== "undefined" && document.visibilityState === "visible") get().markSeen();
      else set({ unread: get().unread + fromPartner.length });
    }
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
    } catch {
      set({ loadingOlder: false });
    }
  },

  /**
   * Optimistic send: the message shows as "sending" immediately and becomes the
   * saved row (same clientId) once the database confirms — or "failed" with a
   * Retry. Never shown as sent unless the database has it.
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
      createdAt: now,
      micros: now * 1000,
      status: "sending",
    };
    set({ messages: [...get().messages, pending] });
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
      const saved = await service.send(pending.content, clientId);
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

  retry(clientId) {
    set({ messages: get().messages.map((message) => (message.clientId === clientId && message.status === "failed" ? { ...message, status: "sending", error: null } : message)) });
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
    const notice = { id: `notice:${newId()}`, senderId: null, type: "system", content, clientId: null, createdAt: now, micros: now * 1000, status: "sent", local: true };
    set({ messages: mergeMessages(get().messages, [notice]) });
  },

  setOpen(open) {
    set({ open });
    if (open) get().markSeen();
  },

  markSeen() {
    const newest = newestConfirmed(get().messages.filter((message) => !message.local));
    if (newest && seenKey) writeSeen(newest.micros);
    if (get().unread) set({ unread: 0 });
  },

  reset: () => {
    service = null;
    recentSends = [];
    set(initialState);
  },
}));
