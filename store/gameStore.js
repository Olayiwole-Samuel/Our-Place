"use client";

import { create } from "zustand";
import { gameApi } from "@/lib/game/client";

/**
 * Game UI + session state (module store, like worldStore/chatStore).
 *
 *   drawer      category id whose drawer is open in the game menu, or null
 *   session     the couple's current session summary (from the server), or null
 *   view        MY view of the authoritative game state (from the server), or null
 *   pending     the request in flight: "create" | "join" | "ready" | "action" | "leave" | null
 *   error       { code, message } for session-level problems (calm copy, never raw errors)
 *   rejection   message for the last rejected move ("That square is taken.")
 *   connection  the games channel: "connecting" | "live" | "reconnecting" | "closed"
 *
 * Authoritative game state never lives here beyond the latest server view, and
 * nothing here is sent back as truth: actions are intents the server validates.
 */
const OPEN = new Set(["created", "waiting", "ready", "active", "paused"]);

const initialState = {
  drawer: null,
  session: null,
  view: null,
  pending: null,
  error: null,
  rejection: null,
  connection: "connecting",
  dismissed: null,
  declined: null,
};

let me = null;

export const sessionPhase = (session, userId) => {
  if (!session) return "none";
  if (session.status === "active" || session.status === "paused") return "playing";
  if (session.status === "waiting" || session.status === "ready" || session.status === "created") {
    return session.players.includes(userId) ? "lobby" : "invite";
  }
  return "result"; // completed | abandoned | cancelled
};

export const useGameStore = create((set, get) => ({
  ...initialState,

  init(userId) {
    me = userId;
    set(initialState);
  },
  reset: () => set(initialState),

  openCategory: (drawer) => set({ drawer }),
  closeDrawer: () => set({ drawer: null }),
  setConnection: (connection) => set({ connection }),
  clearRejection: () => set({ rejection: null }),

  /** Accepts a server response unless it's older than what we already show. */
  receive({ session, view }) {
    if (session && session.id === get().declined) return; // an invite we said "not now" to
    const current = get().session;
    if (session && current && session.id === current.id && session.version < current.version) return;
    // Dismissed: a finished game stays closed, and a declined invite stays hidden.
    if (session && get().dismissed === session.id && (!OPEN.has(session.status) || sessionPhase(session, me) === "invite")) return;
    set({ session: session ?? null, view: view ?? null, error: null });
  },

  async refreshCurrent() {
    const response = await gameApi.current();
    if (response.ok) get().receive(response.data);
    else if (response.code !== "not_paired") set({ error: { code: response.code, message: response.message } });
  },

  async refresh(id = get().session?.id) {
    if (!id) return get().refreshCurrent();
    const response = await gameApi.view(id);
    if (response.ok) get().receive(response.data);
    else if (response.code === "not_found") set({ session: null, view: null, error: { code: "not_found", message: response.message } });
    else set({ error: { code: response.code, message: response.message } });
  },

  /** A database-written event on the couple's games topic. */
  onEvent(event) {
    const current = get().session;
    if (current && event.id === current.id && event.version < current.version) return;
    if (event.id !== current?.id && !OPEN.has(event.status)) return; // an old session finishing elsewhere
    get().refresh(event.id);
  },

  async run(kind, request, { retryOnConflict = false } = {}) {
    if (get().pending) return null;
    set({ pending: kind, rejection: null, error: null });
    let response;
    try {
      response = await request();
      // The partner acted first and our view was a version behind: catch up, then
      // send the same intent once more (the server re-validates it). Without this
      // a tap made just as the partner's move landed was silently dropped.
      if (!response.ok && response.code === "conflict" && retryOnConflict) {
        await get().refresh();
        response = await request();
      }
    } catch {
      // Never leave `pending` stuck: it would block every later game action.
      response = { ok: false, code: "unavailable", message: "Something went wrong. Try again." };
    } finally {
      set({ pending: null });
    }
    if (response.ok) {
      if (response.data.session !== undefined) {
        // Keep the board we have only for the same session: another game's view
        // (e.g. a Ludo board while a new Tic Tac Toe starts) would crash its client.
        const sameSession = response.data.session?.id === get().session?.id;
        get().receive({ session: response.data.session, view: response.data.view ?? (sameSession ? get().view : null) });
      }
      return response.data;
    }
    // Rules mark idempotent duplicates (a double tap) with codes starting
    // "already_": the state is already what the player wanted, so stay quiet.
    if (response.code === "rejected" && String(response.detail?.code ?? "").startsWith("already_")) get().refresh();
    else if (response.code === "rejected") set({ rejection: response.detail?.message ?? response.message });
    else if (response.code === "conflict") get().refresh();
    else if (response.code === "session_open") {
      await get().refreshCurrent();
      set({ error: { code: response.code, message: response.message } });
    } else set({ error: { code: response.code, message: response.message } });
    return null;
  },

  async launch(gameId) {
    set({ drawer: null, dismissed: null });
    const data = await get().run("create", () => gameApi.create(gameId));
    return Boolean(data);
  },
  // A tap on a panel that is already closing (its session gone) does nothing.
  join: () => (get().session ? get().run("join", () => gameApi.join(get().session.id)) : null),
  setReady: (ready) => (get().session ? get().run("ready", () => gameApi.ready(get().session.id, ready)) : null),
  act: (type, payload) =>
    get().session &&
    get().run(
      "action",
      () => {
        const { session } = get(); // read on each try, so a retry carries the fresh version
        return gameApi.action(session.id, { type, payload, version: session.version });
      },
      { retryOnConflict: true },
    ),
  async leave() {
    const id = get().session?.id;
    if (!id) return;
    await get().run("leave", () => gameApi.leave(id));
  },

  /**
   * "Not now" on an invite: close it here and tell the partner. Only players can
   * cancel a session, so this joins and leaves at once (the session ends as
   * cancelled and the partner sees "This game didn't start" instead of waiting).
   */
  async decline() {
    const id = get().session?.id;
    if (!id) return;
    set({ declined: id });
    get().dismiss();
    const joined = await gameApi.join(id);
    if (joined.ok) await gameApi.leave(id);
  },

  /** Close a finished game and return to the room. */
  dismiss() {
    const id = get().session?.id ?? null;
    set({ session: null, view: null, dismissed: id, error: null, rejection: null });
  },

  /** For components: who am I (set by the lobby from verified couple state). */
  me: () => me,
}));
