"use client";

import { create } from "zustand";
import { logConnection } from "@/lib/diagnostics/connectionLog";

/**
 * The bedroom (supabase/migrations/20261102000000_bedroom.sql):
 *
 *   available   the bedroom tables exist (false before the migration → the panel says so)
 *   sleep       the shared sleep sound: { sound, startedAt, minutes, updatedBy } | null
 *   goodnights  recent goodnights: [{ userId, night, saidAt, note }]
 *   wishes      the wish jar: [{ id, userId, wish (null = your partner's secret), shared, createdAt }]
 *   lying       you're lying on the bed (this device)
 *   tab         which part of the bedroom panel is open: "goodnight" | "sounds" | "sky"
 *   soundVolume sleep sound volume on this phone, 0–1 (never shared)
 *
 * The room store opens and closes it and forwards the lobby topic's areas
 * "bedroom", "goodnight" and "wishes" here.
 */
export const BEDROOM_AREAS = new Set(["bedroom", "goodnight", "wishes"]);

const initial = { available: true, sleep: null, goodnights: [], wishes: [], lying: false, tab: "goodnight", soundVolume: 0.7 };
let ctx = null;

const codeOf = (error) => error?.message?.match(/room:([a-z_]+)/)?.[1] ?? "unknown";

export const useBedroomStore = create((set, get) => ({
  ...initial,

  open({ supabase, userId }) {
    ctx = { supabase, userId };
    for (const area of BEDROOM_AREAS) get().refresh(area);
  },

  close() {
    ctx = null;
    set({ ...initial, soundVolume: get().soundVolume });
  },

  async refresh(area) {
    const here = ctx;
    if (!here) return;
    const { supabase } = here;
    try {
      if (area === "bedroom") {
        const { data, error } = await supabase.from("couple_bedroom").select("sound, started_at, minutes, updated_by").maybeSingle();
        if (here !== ctx) return;
        if (error) return set({ available: false });
        set({ available: true, sleep: data?.sound ? { sound: data.sound, startedAt: data.started_at, minutes: data.minutes, updatedBy: data.updated_by } : null });
      } else if (area === "goodnight") {
        const { data, error } = await supabase.from("couple_goodnights").select("user_id, night, said_at, note").order("said_at", { ascending: false }).limit(60);
        if (!error && here === ctx) set({ goodnights: data.map((g) => ({ userId: g.user_id, night: g.night, saidAt: g.said_at, note: g.note })) });
      } else if (area === "wishes") {
        const { data, error } = await supabase.rpc("wish_jar");
        if (!error && here === ctx) set({ wishes: (data ?? []).map((w) => ({ id: w.id, userId: w.user_id, wish: w.wish, shared: w.shared, createdAt: w.created_at })) });
      }
    } catch (error) {
      logConnection("bedroom", `couldn't load ${area}: ${error?.message ?? error}`);
    }
  },

  async setSleepSound(sound, minutes = null) {
    if (!ctx) return "unavailable";
    const { data, error } = await ctx.supabase.rpc("set_sleep_sound", { sound, minutes });
    if (error) return codeOf(error);
    const row = Array.isArray(data) ? data[0] : data;
    set({ sleep: row?.sound ? { sound: row.sound, startedAt: row.started_at, minutes: row.minutes, updatedBy: row.updated_by } : null });
    return null;
  },

  async sayGoodnight(note) {
    if (!ctx) return "unavailable";
    const { error } = await ctx.supabase.rpc("say_goodnight", { note: note?.trim() || null });
    if (error) return codeOf(error);
    await get().refresh("goodnight");
    return null;
  },

  async makeWish(wish, shared = false) {
    if (!ctx) return "unavailable";
    const { error } = await ctx.supabase.rpc("make_wish", { wish, shared });
    if (error) return codeOf(error);
    await get().refresh("wishes");
    return null;
  },

  async updateWish(wishId, change) {
    if (!ctx) return "unavailable";
    const { error } = await ctx.supabase.rpc("update_wish", { wish_id: wishId, shared: change.shared ?? null, remove: Boolean(change.remove) });
    if (error) return codeOf(error);
    await get().refresh("wishes");
    return null;
  },

  setLying: (lying) => set({ lying }),
  setTab: (tab) => set({ tab }),
  setSoundVolume: (soundVolume) => set({ soundVolume: Math.max(0, Math.min(1, soundVolume)) }),
}));
