"use client";

import { create } from "zustand";
import { MAX_POINTS_PER_HIT, ROUND_MS, multiplier, roundPlan, shoot } from "@/lib/range/targets";
import { playSound } from "@/lib/ui/sounds";
import { useRoomStore } from "./roomStore";

/**
 * Shooting at the range (lib/range/targets.js has the rules):
 *
 *   lane       null (not shooting) | 0 | 1 — the lane you stepped up to
 *   phase      "ready" (rules + Start) → "countdown" (3, 2, 1) → "playing" → "done"
 *   startedAt  when the round began (Date.now)
 *   plan       this round's targets (from its seed)
 *   hit        Set of target ids already hit
 *   score, hits, shots, streak, bestStreak
 *   popups     recent hits for the "+10" floaters: [{ id, x, y, z, points, bullseye, at }]
 *   holes      recent misses on the back wall: [{ x, y }]
 *   result     the finished round { score, hits, shots, bestStreak, best } (best = a new personal best)
 *   partnerLive  what your partner is doing at the range right now { score, phase } | null
 *
 * Shots are aimed by tapping / clicking (useWorldControls → aim(); the 3D
 * layer turns the screen point into a ray and calls fire()).
 */
const COUNTDOWN_MS = 2400;
let timers = [];
const clear = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

const fresh = { phase: "ready", countdownAt: null, startedAt: null, plan: [], hit: new Set(), score: 0, hits: 0, shots: 0, streak: 0, bestStreak: 0, popups: [], holes: [], result: null, aims: [] };

export const useRangeStore = create((set, get) => ({
  lane: null,
  ...fresh,
  partnerLive: null,

  enter(lane) {
    clear();
    set({ lane, ...fresh, hit: new Set() });
    useRoomStore.getState().refresh("range");
  },
  leave() {
    clear();
    set({ lane: null, ...fresh, hit: new Set() });
  },

  begin() {
    const { lane } = get();
    if (lane === null) return;
    clear();
    const seed = (Date.now() ^ (lane * 7919)) >>> 0;
    set({ ...fresh, hit: new Set(), phase: "countdown", countdownAt: Date.now(), plan: roundPlan(seed, lane) });
    timers.push(
      setTimeout(() => {
        set({ phase: "playing", startedAt: Date.now() });
        timers.push(setTimeout(() => get().finish(), ROUND_MS));
      }, COUNTDOWN_MS),
    );
  },

  /** A tap / click at a screen point: queued for the 3D layer to turn into a ray. */
  aim(clientX, clientY) {
    if (get().phase !== "playing") return;
    set({ aims: [...get().aims, { clientX, clientY }] });
  },
  takeAims() {
    const aims = get().aims;
    if (aims.length) set({ aims: [] });
    return aims;
  },

  /** One shot along a ray (from the 3D layer). */
  fire(origin, direction, wallPoint) {
    const state = get();
    if (state.phase !== "playing") return null;
    const t = Date.now() - state.startedAt;
    const outcome = shoot(state.plan, state.hit, t, origin, direction);
    playSound("shot");
    if (!outcome.hit) {
      set({ shots: state.shots + 1, streak: 0, holes: wallPoint ? [...state.holes.slice(-24), wallPoint] : state.holes });
      return outcome;
    }
    const points = Math.min(MAX_POINTS_PER_HIT, outcome.points * multiplier(state.streak));
    const hit = new Set(state.hit);
    hit.add(outcome.target.id);
    const streak = state.streak + 1;
    playSound(outcome.bullseye ? "bullseye" : "hit");
    set({
      hit,
      shots: state.shots + 1,
      hits: state.hits + 1,
      score: state.score + points,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      popups: [...state.popups.slice(-6), { id: `${outcome.target.id}-${t}`, ...outcome.point, points, bullseye: outcome.bullseye, at: Date.now(), targetId: outcome.target.id }],
    });
    return { ...outcome, points };
  },

  async finish() {
    const { score, hits, shots, bestStreak, phase } = get();
    if (phase !== "playing") return;
    clear();
    const before = useRoomStore.getState().range?.myBest ?? 0;
    set({ phase: "done", result: { score, hits, shots, bestStreak, best: score > before && score > 0 } });
    playSound(score > before && score > 0 ? "win" : "card");
    await useRoomStore.getState().saveRangeScore({ score, hits, shots, bestStreak });
  },

  setPartnerLive: (partnerLive) => set({ partnerLive }),
}));

/** How long is left in the round (ms). */
export const timeLeft = (state, now = Date.now()) => (state.phase === "playing" && state.startedAt ? Math.max(0, ROUND_MS - (now - state.startedAt)) : state.phase === "done" ? 0 : ROUND_MS);
