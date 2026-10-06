import { describe, expect, it } from "vitest";
import { assessTier } from "./capabilities";
import { createGovernor } from "./governor";
import { PROFILES, effectiveDpr, tierForPreference } from "./profiles";

/** Feeds `seconds` of frames at `fps` (with optional long frames) and evaluates once a second. */
function run(governor, { fps, seconds, from, long = 0 }) {
  const actions = [];
  let t = from;
  for (let s = 0; s < seconds; s += 1) {
    const interval = 1000 / fps;
    for (let f = 0; f < Math.round(fps); f += 1) governor.frame(f < long ? 80 : interval);
    t += 1000;
    const action = governor.evaluate(t);
    if (action) actions.push({ at: t, ...action });
  }
  return { actions, t };
}

describe("device assessment (never by model name)", () => {
  const phone = { touchFirst: true, devicePixelRatio: 2, webgl2: true, maxTextureSize: 8192 };
  it("entry-level phones start LOW", () => {
    expect(assessTier({ ...phone, cores: 8, memoryGb: 4, renderer: "Mali-G57" }).tier).toBe("low"); // Redmi A5 class
    expect(assessTier({ ...phone, cores: 8, memoryGb: 4, renderer: "Mali-G52 MC2" }).tier).toBe("low"); // Redmi 13C class
  });
  it("only a confidently strong desktop starts HIGH", () => {
    expect(assessTier({ touchFirst: false, cores: 12, memoryGb: 8, renderer: "ANGLE (NVIDIA GeForce RTX 3060)", webgl2: true, maxTextureSize: 16384 }).tier).toBe("high");
  });

  it("when uncertain, starts at MEDIUM and lets measurement decide", () => {
    // missing information
    expect(assessTier({ touchFirst: false, cores: null, memoryGb: null, renderer: null, webgl2: true, maxTextureSize: null }).tier).toBe("medium");
    // strong GPU but memory unknown (Safari/Firefox don't report it)
    expect(assessTier({ touchFirst: false, cores: 10, memoryGb: null, renderer: "Apple M2", webgl2: true, maxTextureSize: 16384 }).tier).toBe("medium");
    // flagship phone: strong GPU, still touch-first → earn HIGH at runtime
    expect(assessTier({ ...phone, cores: 8, memoryGb: 8, renderer: "Adreno (TM) 740" }).tier).toBe("medium");
    // integrated laptop GPU (measured too weak for HIGH with imported characters)
    expect(assessTier({ touchFirst: false, cores: 8, memoryGb: 8, renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)", webgl2: true, maxTextureSize: 16384 }).tier).toBe("medium");
  });
  it("software rendering is always LOW", () => {
    expect(assessTier({ touchFirst: false, cores: 16, memoryGb: 8, renderer: "Google SwiftShader", webgl2: true }).tier).toBe("low");
  });
});

describe("profiles", () => {
  it("never render above the screen's real pixel ratio", () => {
    expect(effectiveDpr(1.75, 1)).toBe(1);
    expect(effectiveDpr(1.25, 3)).toBe(1.25);
  });
  it("manual preferences map to tiers; auto keeps the assessed tier", () => {
    expect(tierForPreference("performance", "high")).toBe("low");
    expect(tierForPreference("quality", "low")).toBe("high");
    expect(tierForPreference("auto", "medium")).toBe("medium");
  });
  it("every tier keeps the full experience (only costs differ)", () => {
    for (const profile of Object.values(PROFILES)) {
      expect(profile.renderScales.length).toBeGreaterThan(1);
      expect(profile.renderScales.every((scale) => scale >= 0.75)).toBe(true); // never obviously blurry
    }
  });
});

describe("adaptive governor", () => {
  it("degrades gradually under sustained load: render scale first, then tier", () => {
    const governor = createGovernor({ tier: "medium" });
    const { actions } = run(governor, { fps: 30, seconds: 30, from: 0 });
    expect(actions.map((a) => a.type)).toEqual(["scale", "scale", "tier"]);
    expect(actions.at(-1).tier).toBe("low");
    // ≥ 4 s between changes
    for (let i = 1; i < actions.length; i += 1) expect(actions[i].at - actions[i - 1].at).toBeGreaterThanOrEqual(4000);
  });

  it("holds steady at a stable 30 on LOW (no change needed)", () => {
    const governor = createGovernor({ tier: "low" });
    const { actions } = run(governor, { fps: 30, seconds: 20, from: 0 });
    expect(actions).toEqual([]);
  });

  it("doesn't react to a short hitch", () => {
    const governor = createGovernor({ tier: "medium" });
    const { actions } = run(governor, { fps: 60, seconds: 5, from: 0, long: 0 });
    const hitch = run(governor, { fps: 40, seconds: 2, from: 5000 });
    expect([...actions, ...hitch.actions]).toEqual([]);
  });

  it("recovers render scale only after a long good streak, and never right after dropping", () => {
    const governor = createGovernor({ tier: "medium" });
    let { t } = run(governor, { fps: 40, seconds: 4, from: 0 }); // one scale drop
    expect(governor.scaleIndex).toBe(1);
    const early = run(governor, { fps: 60, seconds: 12, from: t });
    expect(early.actions).toEqual([]); // still inside the 20 s block
    t = early.t;
    const later = run(governor, { fps: 60, seconds: 12, from: t });
    expect(later.actions.map((a) => a.type)).toEqual(["scale"]);
    expect(governor.scaleIndex).toBe(0);
  });

  it("probes before upgrading a 30 fps tier, and only upgrades on real headroom", () => {
    const strong = createGovernor({ tier: "low" });
    const { actions, t } = run(strong, { fps: 30, seconds: 30, from: 0 });
    expect(actions.map((a) => a.type)).toEqual(["probe-start"]);
    expect(strong.probing).toBe(true);
    const probe = run(strong, { fps: 58, seconds: 3, from: t });
    expect(probe.actions).toMatchObject([{ type: "tier", tier: "medium", probeFps: expect.any(Number) }]);

    const weak = createGovernor({ tier: "low" });
    const first = run(weak, { fps: 30, seconds: 30, from: 0 });
    const failed = run(weak, { fps: 36, seconds: 3, from: first.t });
    expect(failed.actions).toMatchObject([{ type: "probe-end" }]);
    expect(weak.tier).toBe("low");
    const retry = run(weak, { fps: 30, seconds: 40, from: failed.t });
    expect(retry.actions).toEqual([]); // no new probe within 60 s
  });

  it("an upgrade that fails becomes the ceiling — no HIGH/LOW flapping", () => {
    const governor = createGovernor({ tier: "medium" });
    let { t } = run(governor, { fps: 60, seconds: 31, from: 0 });
    expect(governor.tier).toBe("high");
    // HIGH is too heavy: drops through its scales, then back to MEDIUM
    ({ t } = run(governor, { fps: 35, seconds: 18, from: t }));
    expect(governor.tier).toBe("medium");
    expect(governor.ceiling).toBe("medium");
    // Even with good frames afterwards, it never tries HIGH again this session.
    const later = run(governor, { fps: 60, seconds: 120, from: t });
    expect(later.actions.every((a) => a.type === "scale")).toBe(true);
    expect(governor.tier).toBe("medium");
  });

  it("manual preferences keep their tier; only render scale adapts", () => {
    const governor = createGovernor({ tier: "high", automatic: false });
    const { actions } = run(governor, { fps: 20, seconds: 40, from: 0 });
    expect(actions.every((a) => a.type === "scale")).toBe(true);
    expect(governor.tier).toBe("high");
  });

  it("manual Quality has a safety floor: a collapse below 15 fps steps the tier down", () => {
    const governor = createGovernor({ tier: "high", automatic: false });
    const { actions } = run(governor, { fps: 6, seconds: 40, from: 0 });
    const safety = actions.find((a) => a.safety);
    expect(safety).toMatchObject({ type: "tier", tier: "medium" });
    // …but only after the lowest render scale also failed
    expect(actions.findIndex((a) => a.safety)).toBe(PROFILES.high.renderScales.length - 1);
  });

  it("ignores a single heavy hitch (warm-up/GC) and doesn't treat it as sustained", () => {
    const governor = createGovernor({ tier: "medium" });
    const { actions } = run(governor, { fps: 60, seconds: 3, from: 0 });
    const spike = run(governor, { fps: 10, seconds: 1, from: 3000 });
    const after = run(governor, { fps: 60, seconds: 10, from: spike.t });
    expect([...actions, ...spike.actions, ...after.actions]).toEqual([]);
  });
});
