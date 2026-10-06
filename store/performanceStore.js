"use client";

import { create } from "zustand";
import { assessTier, readDeviceFacts } from "@/lib/performance/capabilities";
import { PROFILES, tierForPreference } from "@/lib/performance/profiles";

/**
 * Rendering quality state — what the 3D world may spend right now.
 *
 *   preference  "auto" | "performance" | "balanced" | "quality" (account menu;
 *               remembered on this device — it's a display preference, nothing more)
 *   tier        "low" | "medium" | "high" — the active profile (lib/performance/profiles.js)
 *   scaleIndex  index into the profile's renderScales
 *   assessed    { tier, reasons } from the startup capability check
 *
 * Changes here happen a few times per session at most; per-frame numbers live
 * in `diagnostics` (a plain object, not React state) so measuring never
 * re-renders anything.
 */
const KEY = "our-place:graphics";
// What Auto last settled on for this device (so a reload doesn't repeat the slow start).
const LEARNED_KEY = "our-place:graphics-learned";
const RANK = { low: 0, medium: 1, high: 2 };

function readLearned() {
  try {
    const value = window.localStorage.getItem(LEARNED_KEY);
    return value in RANK ? value : null;
  } catch {
    return null;
  }
}

function readPreference() {
  try {
    const value = window.localStorage.getItem(KEY);
    return ["auto", "performance", "balanced", "quality"].includes(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** Live numbers for the developer overlay (mutated by the frame driver). */
export const diagnostics = {
  fps: 0,
  frameMs: 0,
  longFrames: 0,
  cap: 0,
  dpr: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  lastChange: null,
};

export const usePerformanceStore = create((set, get) => ({
  preference: "auto",
  assessed: null,
  tier: "medium",
  scaleIndex: 0,
  initialized: false,

  /** Once per page, in the browser, before the world is created. */
  init() {
    if (get().initialized) return;
    const assessed = assessTier(readDeviceFacts());
    const learned = readLearned();
    // Auto starts at the lower of the assessment and what this device sustained
    // last time; the governor can still raise it (probe) when there's headroom.
    const autoTier = learned && RANK[learned] < RANK[assessed.tier] ? learned : assessed.tier;
    const preference = readPreference();
    set({ assessed: { ...assessed, learned }, preference, tier: tierForPreference(preference, autoTier), scaleIndex: 0, initialized: true });
  },

  setPreference(preference) {
    try {
      window.localStorage.setItem(KEY, preference);
    } catch {
      // not remembered; still applies now
    }
    const assessed = get().assessed ?? { tier: "medium", reasons: [], learned: null };
    const autoTier = assessed.learned && RANK[assessed.learned] < RANK[assessed.tier] ? assessed.learned : assessed.tier;
    set({ preference, tier: tierForPreference(preference, autoTier), scaleIndex: 0 });
  },

  /** Applied by the frame driver when the governor steps quality. */
  apply({ tier, scaleIndex }) {
    if (tier === get().tier && scaleIndex === get().scaleIndex) return;
    if (get().preference === "auto" && tier !== get().tier) {
      try {
        window.localStorage.setItem(LEARNED_KEY, tier);
      } catch {
        // not remembered
      }
    }
    set({ tier, scaleIndex });
  },

  profile: () => PROFILES[get().tier],
}));

/** Developer overlay switch: development builds only, via ?perf=1 (remembered for the tab). */
export function performanceOverlayEnabled() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("perf") === "1") window.sessionStorage.setItem("our-place:perf", "1");
    return window.sessionStorage.getItem("our-place:perf") === "1";
  } catch {
    return false;
  }
}
