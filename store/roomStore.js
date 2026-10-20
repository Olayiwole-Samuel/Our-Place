"use client";

import { create } from "zustand";
import { logConnection } from "@/lib/diagnostics/connectionLog";
import { COUPLE_CHANNEL, coupleChannelName } from "@/lib/realtime/channels";
import { openResilientChannel } from "@/lib/realtime/resilientChannel";

/**
 * The living room's shared things — everything the two of you leave in the
 * room, read under RLS and kept fresh by the database's announcements on the
 * couple's `lobby` topic (supabase/migrations/20261013000000_room_features.sql):
 *
 *   streak         { current, best, todayBoth } — days in a row you were BOTH here
 *   partnerSeenAt  when your partner was last in Our Place (ISO) or null
 *   notes          message-board notes, newest first; unseenNotes = partner's notes you haven't opened
 *   memories       memory-wall photos { id, url, caption, takenOn, uploaderId, createdAt }
 *   videos         TV library { id, kind, title, sizeBytes, status, uploaderId }
 *   watch          what the TV plays: { source, playing, atSeconds, updatedAt, updatedBy, version } | null
 *   trophies       bookshelf counts (couple_trophies()), loaded when the shelf opens
 *   panel          which room panel is open: null | "notes" | "memories" | "tv" | "shelf"
 *   skewMs         server clock minus this device's clock, for in-sync playback
 *
 * Presence for "last seen" and the streak: note_presence() on arrival, every
 * 2 minutes while the room is open and visible, and when leaving.
 */
const PRESENCE_EVERY_MS = 120_000;
const SIGNED_URL_SECONDS = 3600;

const initialState = {
  ready: false,
  streak: { current: 0, best: 0, todayBoth: false },
  partnerSeenAt: null,
  notes: [],
  unseenNotes: 0,
  memories: [],
  videos: [],
  watch: null,
  trophies: null,
  panel: null,
  skewMs: null, // server clock − this device's clock (ms), measured on our TV writes
};

let ctx = null; // { supabase, coupleId, userId, partnerId, channel, timer, cleanups }

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";
  } catch {
    return "Africa/Lagos";
  }
};

const toWatch = (row) =>
  row && {
    source: row.source ?? null,
    playing: Boolean(row.playing),
    atSeconds: Number(row.at_seconds ?? 0),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
    version: Number(row.version ?? 0),
  };

export const useRoomStore = create((set, get) => ({
  ...initialState,

  /** Opens the room for this couple. Returns a cleanup. */
  open({ supabase, coupleId, userId, partnerId }) {
    if (get().preview) return () => {}; // dev preview (/dev/hud): sample data, no session
    get().close();
    ctx = { supabase, coupleId, userId, partnerId, cleanups: [] };
    const here = ctx;

    const presence = () => {
      const sentAt = Date.now();
      return supabase.rpc("note_presence", { tz: zone() }).then(({ data, error }) => {
        if (error) return logConnection("room", `presence not saved: ${error.message}`);
        // The server's clock vs ours (for in-sync watch-together playback).
        const skew = Date.parse(data) - (sentAt + Date.now()) / 2;
        if (Number.isFinite(skew) && here === ctx) set({ skewMs: get().skewMs === null ? skew : Math.round(get().skewMs * 0.5 + skew * 0.5) });
      });
    };
    presence().then(() => {
      if (here !== ctx) return;
      get().refresh("streak");
      // "❤️ <you> is in Our Place" on your partner's phone, if they're not here (the server decides).
      import("@/lib/push/client").then(({ announceArrival }) => announceArrival()).catch(() => {});
    });
    here.timer = setInterval(() => document.visibilityState === "visible" && presence(), PRESENCE_EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && presence().then(() => get().refresh("seen"));
    document.addEventListener("visibilitychange", onVisible);
    here.cleanups.push(() => document.removeEventListener("visibilitychange", onVisible));

    here.channel = openResilientChannel({
      supabase,
      topic: coupleChannelName(coupleId, COUPLE_CHANNEL.LOBBY),
      options: { config: { private: true, broadcast: { self: true, ack: false } } },
      area: "room",
      bind: (channel) =>
        channel.on("broadcast", { event: "room" }, ({ payload }) => {
          if (here !== ctx || !payload?.area) return;
          // The lobby topic is also client-writable, so an announcement is only a
          // hint: what changed is always re-read from the database.
          get().refresh(payload.area);
        }),
      onStatus: (status) => {
        // Back after a drop: catch up on anything missed.
        if (status === "SUBSCRIBED" && here === ctx && get().ready) get().refreshAll();
      },
    });

    get().refreshAll().then(() => here === ctx && set({ ready: true }));
    return () => get().close();
  },

  close() {
    if (!ctx) return;
    const closing = ctx;
    ctx = null;
    clearInterval(closing.timer);
    closing.cleanups.forEach((cleanup) => cleanup());
    closing.supabase.rpc("note_presence", { tz: zone() }).then(() => {}, () => {}); // "last here" = now
    closing.channel?.close();
    set({ ...initialState, skewMs: get().skewMs });
  },

  async refreshAll() {
    await Promise.all(["streak", "seen", "notes", "memories", "videos", "watch"].map((area) => get().refresh(area)));
  },

  async refresh(area) {
    const here = ctx;
    if (!here) return;
    const { supabase, userId, partnerId } = here;
    try {
      if (area === "streak") {
        const { data } = await supabase.rpc("couple_streak");
        const row = Array.isArray(data) ? data[0] : data;
        if (row && here === ctx) set({ streak: { current: row.current_days ?? 0, best: row.best_days ?? 0, todayBoth: Boolean(row.today_both) } });
      } else if (area === "seen") {
        const { data } = await supabase.from("couple_visits").select("last_at").eq("user_id", partnerId).order("last_at", { ascending: false }).limit(1);
        if (here === ctx) set({ partnerSeenAt: data?.[0]?.last_at ?? null });
      } else if (area === "notes") {
        const { data } = await supabase.from("couple_notes").select("id, author_id, body, color, created_at, seen_at").order("created_at", { ascending: false }).limit(100);
        const notes = (data ?? []).map((n) => ({ id: n.id, authorId: n.author_id, body: n.body, color: n.color, createdAt: n.created_at, seenAt: n.seen_at }));
        if (here === ctx) set({ notes, unseenNotes: notes.filter((n) => n.authorId !== userId && !n.seenAt).length });
      } else if (area === "memories") {
        const { data } = await supabase.from("couple_memories").select("id, uploader_id, path, caption, taken_on, created_at").order("created_at", { ascending: false }).limit(200);
        const rows = data ?? [];
        const signed = new Map();
        if (rows.length) {
          const { data: urls } = await supabase.storage.from("couple-memories").createSignedUrls(rows.map((r) => r.path), SIGNED_URL_SECONDS);
          for (const entry of urls ?? []) if (entry.signedUrl) signed.set(entry.path, entry.signedUrl);
        }
        if (here === ctx) set({ memories: rows.map((r) => ({ id: r.id, uploaderId: r.uploader_id, url: signed.get(r.path) ?? null, caption: r.caption, takenOn: r.taken_on, createdAt: r.created_at })) });
      } else if (area === "videos") {
        const { data } = await supabase.from("couple_videos").select("id, uploader_id, kind, title, size_bytes, content_type, status, created_at").order("created_at", { ascending: false });
        if (here === ctx) set({ videos: (data ?? []).map((v) => ({ id: v.id, uploaderId: v.uploader_id, kind: v.kind, title: v.title, sizeBytes: Number(v.size_bytes), contentType: v.content_type, status: v.status, createdAt: v.created_at })) });
      } else if (area === "watch") {
        const { data } = await supabase.from("couple_watch").select("source, playing, at_seconds, updated_at, updated_by, version").maybeSingle();
        if (here === ctx && data) get().receiveWatch(data);
        else if (here === ctx) set({ watch: null });
      } else if (area === "trophies") {
        const { data } = await supabase.rpc("couple_trophies");
        if (here === ctx) set({ trophies: data ?? null });
      }
    } catch (error) {
      logConnection("room", `couldn't load ${area}: ${error?.message ?? error}`);
    }
  },

  /** A TV state read from the database (or returned by set_watch) — newer versions only. */
  receiveWatch(payload) {
    const next = toWatch(payload);
    const current = get().watch;
    if (current && next.version <= current.version) return;
    set({ watch: next });
  },

  // ── Panels ────────────────────────────────────────────────────────────────
  openPanel(panel) {
    set({ panel });
    if (panel === "notes" && get().unseenNotes) ctx?.supabase.rpc("mark_notes_seen").then(() => get().refresh("notes"));
    if (panel === "shelf") get().refresh("trophies");
  },
  closePanel: () => set({ panel: null }),

  // ── Writes (all checked again by the database / server) ───────────────────
  async addNote(body, color) {
    const { error } = await ctx.supabase.rpc("add_note", { body, color });
    if (error) return error.message.match(/room:([a-z_]+)/)?.[1] ?? "unknown";
    await get().refresh("notes");
    return null;
  },
  async deleteNote(id) {
    await ctx.supabase.rpc("delete_note", { note_id: id });
    await get().refresh("notes");
  },

  /** Sets what the TV plays; returns an error code or null. */
  async setWatch({ source, playing, atSeconds }) {
    if (!ctx) return "unavailable";
    const sentAt = Date.now();
    const { data, error } = await ctx.supabase.rpc("set_watch", { source, playing, at_seconds: Math.max(0, atSeconds || 0) });
    if (error) return error.message.match(/room:([a-z_]+)/)?.[1] ?? "unknown";
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      // This device's clock vs the server's (the write happened mid-request).
      const skew = Date.parse(row.updated_at) - (sentAt + Date.now()) / 2;
      if (Number.isFinite(skew)) set({ skewMs: get().skewMs === null ? skew : Math.round(get().skewMs * 0.5 + skew * 0.5) });
      get().receiveWatch(row);
    }
    return null;
  },

  me: () => ctx?.userId ?? null,
}));

/** "3 minutes ago", "yesterday", "on 12 Oct" — for "last here". */
export function lastSeenText(iso, now = Date.now()) {
  if (!iso) return null;
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 2 * 86_400) return "yesterday";
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} days ago`;
  return `on ${new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
