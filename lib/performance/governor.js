import { PROFILES, higherTier, lowerTier } from "./profiles";

/**
 * Adaptive quality governor — pure logic (time is passed in), so it's testable.
 *
 * The frame driver feeds it frame times; once a second it evaluates the last
 * window and may step quality. Order of degradation:
 *
 *   lower render scale (subtle) → next tier down (Auto only) → …
 *
 * Stability rules (no HIGH/LOW/HIGH flapping):
 *   - a step down needs 3 consecutive bad seconds; a step up needs 10–30 good ones
 *   - at least 4 s between any two changes; no step up for 20 s after a step down
 *   - if a tier upgrade is followed by a downgrade within 30 s, that tier becomes
 *     the ceiling for the rest of the session
 *   - at most 2 tier upgrades per session
 *
 * A 30 fps-capped tier can't show headroom, so before upgrading from it the
 * governor asks for a short uncapped PROBE (3 s) and only upgrades if the device
 * really sustained ~50 fps.
 *
 * Measurement: per-second windows of frame intervals → fps and long frames
 * (> 50 ms). Never a single 1/delta.
 */
const LONG_FRAME_MS = 50;
const BAD_WINDOWS_TO_DROP = 3;
const GOOD_WINDOWS_TO_RAISE_SCALE = 10;
const GOOD_WINDOWS_TO_RAISE_TIER = 30;
const MIN_CHANGE_GAP_MS = 4000;
const RAISE_BLOCK_AFTER_DROP_MS = 20000;
const REGRET_WINDOW_MS = 30000;
const MAX_TIER_UPGRADES = 2;
const PROBE_MS = 3000;
const PROBE_PASS_FPS = 50;
const PROBE_RETRY_MS = 60000;
// Manual settings keep their tier, except as a last resort: if even the lowest
// render scale stays below SAFETY_FPS for SAFETY_WINDOWS seconds, step the tier
// down so a "Quality" choice can never make Our Place unusable.
const SAFETY_FPS = 15;
const SAFETY_WINDOWS = 5;

export function createGovernor({ tier, scaleIndex = 0, automatic = true, now = 0 }) {
  const state = {
    tier,
    scaleIndex,
    automatic,
    ceiling: "high",
    window: { start: now, frames: 0, long: 0 },
    bad: 0,
    good: 0,
    critical: 0,
    lastChangeAt: -Infinity,
    lastDropAt: -Infinity,
    lastUpgradeAt: -Infinity,
    upgrades: 0,
    probe: null, // { until, frames, start }
    lastProbeAt: -Infinity,
    stats: { fps: 0, frameMs: 0, longFrames: 0 },
  };

  const profile = () => PROFILES[state.tier];
  const canChange = (t) => t - state.lastChangeAt >= MIN_CHANGE_GAP_MS;

  function changed(t) {
    state.lastChangeAt = t;
    state.bad = 0;
    state.good = 0;
    state.critical = 0;
  }

  function stepDown(t) {
    const scales = profile().renderScales;
    if (state.scaleIndex < scales.length - 1) {
      state.scaleIndex += 1;
      changed(t);
      state.lastDropAt = t;
      return { type: "scale", tier: state.tier, scaleIndex: state.scaleIndex };
    }
    const safety = !state.automatic && state.critical >= SAFETY_WINDOWS && state.tier !== "low";
    if ((state.automatic && state.tier !== "low") || safety) {
      const current = scales[state.scaleIndex];
      if (t - state.lastUpgradeAt < REGRET_WINDOW_MS) state.ceiling = lowerTier(state.tier); // that upgrade was a mistake
      state.tier = lowerTier(state.tier);
      const next = PROFILES[state.tier].renderScales;
      state.scaleIndex = Math.max(0, next.findIndex((scale) => scale <= current));
      changed(t);
      state.lastDropAt = t;
      return { type: "tier", tier: state.tier, scaleIndex: state.scaleIndex, ...(safety ? { safety: true } : {}) };
    }
    return null;
  }

  function stepUp(t) {
    if (t - state.lastDropAt < RAISE_BLOCK_AFTER_DROP_MS) return null;
    if (state.scaleIndex > 0 && state.good >= GOOD_WINDOWS_TO_RAISE_SCALE) {
      state.scaleIndex -= 1;
      changed(t);
      return { type: "scale", tier: state.tier, scaleIndex: state.scaleIndex };
    }
    const target = higherTier(state.tier);
    const allowed = state.automatic && target !== state.tier && state.upgrades < MAX_TIER_UPGRADES && rank(target) <= rank(state.ceiling);
    if (!allowed || state.scaleIndex !== 0 || state.good < GOOD_WINDOWS_TO_RAISE_TIER) return null;
    if (profile().maxFps < 60) {
      if (t - state.lastProbeAt < PROBE_RETRY_MS) return null;
      state.probe = { start: t, until: t + PROBE_MS, frames: 0 };
      state.lastProbeAt = t;
      return { type: "probe-start" };
    }
    return upgrade(t);
  }

  function upgrade(t) {
    state.tier = higherTier(state.tier);
    state.scaleIndex = Math.min(1, PROFILES[state.tier].renderScales.length - 1); // enter the new tier gently
    state.upgrades += 1;
    state.lastUpgradeAt = t;
    changed(t);
    return { type: "tier", tier: state.tier, scaleIndex: state.scaleIndex };
  }

  return {
    /** One rendered frame; `intervalMs` = time since the previous frame. */
    frame(intervalMs) {
      if (state.probe) state.probe.frames += 1;
      state.window.frames += 1;
      if (intervalMs > LONG_FRAME_MS) state.window.long += 1;
    },

    /** Call about once a second. Returns a change to apply, or null. */
    evaluate(t) {
      if (state.probe) {
        if (t < state.probe.until) return null;
        const fps = (state.probe.frames * 1000) / Math.max(1, t - state.probe.start);
        state.probe = null;
        resetWindow(t);
        if (fps >= PROBE_PASS_FPS) return { ...upgrade(t), probeFps: Math.round(fps) };
        state.good = 0;
        return { type: "probe-end", probeFps: Math.round(fps) };
      }
      const elapsed = t - state.window.start;
      if (elapsed < 900) return null;
      const fps = (state.window.frames * 1000) / elapsed;
      const long = state.window.long;
      state.stats = { fps: Math.round(fps * 10) / 10, frameMs: Math.round((elapsed / Math.max(1, state.window.frames)) * 10) / 10, longFrames: long };
      resetWindow(t);

      const target = profile().maxFps;
      state.critical = fps < SAFETY_FPS ? state.critical + 1 : 0;
      if (fps < target * 0.85 || long >= 3) {
        state.bad += 1;
        state.good = 0;
      } else if (fps >= target * 0.95 && long === 0) {
        state.good += 1;
        state.bad = 0;
      } else {
        state.bad = 0;
      }
      if (!canChange(t)) return null;
      if (state.bad >= BAD_WINDOWS_TO_DROP) return stepDown(t);
      if (state.good > 0) return stepUp(t);
      return null;
    },

    /** Pause measuring (tab hidden, frame cap lowered for idle/overlay). */
    pause(t) {
      state.probe = null;
      resetWindow(t);
      state.bad = 0;
    },

    get tier() {
      return state.tier;
    },
    get scaleIndex() {
      return state.scaleIndex;
    },
    get probing() {
      return Boolean(state.probe);
    },
    get ceiling() {
      return state.ceiling;
    },
    get stats() {
      return state.stats;
    },
  };

  function resetWindow(t) {
    state.window = { start: t, frames: 0, long: 0 };
  }
}

const rank = (tier) => ["low", "medium", "high"].indexOf(tier);
