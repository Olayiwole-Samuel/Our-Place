"use client";

import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { createGovernor } from "@/lib/performance/governor";
import { PROFILES, effectiveDpr } from "@/lib/performance/profiles";
import { diagnostics, usePerformanceStore } from "@/store/performanceStore";
import { toast } from "@/store/toastStore";
import { useWorldStore } from "@/store/worldStore";

const IDLE_AFTER_MS = 4000;
const EMOTE_ACTIVE_MS = 4500; // longest emote (dance) + fade
const CALM_FPS = 30;
const STATS_INTERVAL_MS = 500;
// Model/texture uploads and shader compilation make the first seconds uneven;
// judging the device on them would drop quality for no reason.
const WARMUP_MS = 6000;

/**
 * Drives the world's frames (the Canvas runs with frameloop="never").
 *
 * - Frame cap: the profile's maxFps (LOW = a steady 30). The cap drops to 30 when
 *   nothing in the room is changing (no input, no camera drag, still partner, no
 *   emote for 4 s) and while a game panel has focus. Characters keep breathing at
 *   30 fps; GPU work, heat and battery drop by about half.
 * - Measurement: real frame intervals → the governor (once a second), never a
 *   single 1/delta. Intentionally capped periods aren't measured.
 * - Adaptation: governor steps → render scale via setDpr (no React render of the
 *   scene) or a tier change via the performance store.
 * - Hidden tab: requestAnimationFrame stops by itself; measurement pauses, and
 *   nothing catches up on return (no long-frame storm).
 */
export function FrameDriver({ runtime }) {
  const gl = useThree((state) => state.gl);
  const setDpr = useThree((state) => state.setDpr);
  const tier = usePerformanceStore((state) => state.tier);
  const scaleIndex = usePerformanceStore((state) => state.scaleIndex);
  const preference = usePerformanceStore((state) => state.preference);

  // Render scale follows the store (tier/scale changes, preference changes).
  useEffect(() => {
    const scales = PROFILES[tier].renderScales;
    const dpr = effectiveDpr(scales[Math.min(scaleIndex, scales.length - 1)], window.devicePixelRatio);
    setDpr(dpr);
    diagnostics.dpr = dpr;
  }, [tier, scaleIndex, setDpr]);

  useEffect(() => {
    const store = usePerformanceStore.getState();
    const governor = createGovernor({ tier: store.tier, scaleIndex: store.scaleIndex, automatic: preference === "auto", now: performance.now() });
    let raf = 0;
    let last = 0;
    let lastEval = performance.now();
    let lastStats = 0;
    let lastActivity = performance.now();
    let yaw = runtime.camera.yaw;
    let emoteKey = "";
    let emoteAt = -Infinity;
    let wasCalm = false;
    const startedAt = performance.now();
    let wasWarm = false;

    const isActive = (now) => {
      const move = runtime.input.getMove();
      const keys = `${runtime.emotes.local?.id ?? ""}|${runtime.emotes.partner?.id ?? ""}`;
      if (keys !== emoteKey) {
        emoteKey = keys;
        emoteAt = now;
      }
      const active =
        move.x !== 0 ||
        move.y !== 0 ||
        runtime.camera.yaw !== yaw ||
        now - runtime.partnerBuffer.lastReceivedAt < 1000 ||
        now - emoteAt < EMOTE_ACTIVE_MS ||
        runtime.localPose.anim === "walk";
      yaw = runtime.camera.yaw;
      if (active) lastActivity = now;
      return now - lastActivity < IDLE_AFTER_MS;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        last = 0;
        governor.pause(performance.now());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const profile = PROFILES[governor.tier];
      const calm = !isActive(now) || useWorldStore.getState().inGame;
      const cap = governor.probing ? 0 : calm ? Math.min(CALM_FPS, profile.maxFps) : profile.maxFps;
      if (cap && last && now - last < 1000 / cap - 2) return; // 2 ms tolerance for vsync jitter
      const interval = last ? now - last : 1000 / (cap || 60);
      last = now;
      advance(now);

      const warmedUp = now - startedAt > WARMUP_MS;
      if (warmedUp && !wasWarm) {
        wasWarm = true;
        governor.pause(now); // first window starts now, not at page load
        lastEval = now;
      }
      const measuring = warmedUp && (governor.probing || cap === profile.maxFps);
      if (calm !== wasCalm) {
        wasCalm = calm;
        governor.pause(now); // don't judge the device on intentionally capped frames
        lastEval = now;
      }
      if (measuring) governor.frame(interval);
      if (now - lastEval >= 1000) {
        lastEval = now;
        const change = measuring ? governor.evaluate(now) : null;
        if (change) {
          diagnostics.lastChange = { ...change, at: Math.round(now / 1000) };
          if (change.type === "scale" || change.type === "tier") usePerformanceStore.getState().apply({ tier: change.tier, scaleIndex: change.scaleIndex });
          if (change.safety) toast("Graphics lowered to keep Our Place smooth on this device.");
        }
        Object.assign(diagnostics, governor.stats);
      }
      if (now - lastStats >= STATS_INTERVAL_MS) {
        lastStats = now;
        const { render, memory, programs } = gl.info;
        diagnostics.cap = cap;
        diagnostics.calls = render.calls;
        diagnostics.triangles = render.triangles;
        diagnostics.geometries = memory.geometries;
        diagnostics.textures = memory.textures;
        diagnostics.programs = programs?.length ?? 0;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gl, runtime, preference]);

  return null;
}
