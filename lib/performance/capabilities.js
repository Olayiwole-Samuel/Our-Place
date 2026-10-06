/**
 * Lightweight device capability assessment → the starting tier. No benchmark
 * scene, no waiting: a handful of synchronous reads at startup. The runtime
 * governor (lib/performance/governor.js) then corrects the tier from measured
 * frame times, so this only needs to be a sensible first guess.
 *
 * Never decides by device model. Uses only what rendering needs: CPU cores,
 * device memory (Chrome), screen size × pixel ratio, touch-first input, WebGL 2
 * support, max texture size and the GPU renderer string. Nothing here is sent
 * anywhere or stored — no fingerprinting.
 */

// GPU families that struggle with a lit 3D scene at native resolution
// (entry-level Mali/PowerVR/older Adreno, software renderers).
const WEAK_GPU = /Mali-(G5[0-9]|G3[0-9]|T\d)|PowerVR|Adreno \(TM\) ([1-5]\d\d)\b|SwiftShader|llvmpipe|Software|Microsoft Basic Render/i;
const STRONG_GPU = /Apple|Adreno \(TM\) (6[5-9]\d|7\d\d|8\d\d)|Mali-G(7[1-9]|6[1-9]\d|7\d\d)|Immortalis|NVIDIA|GeForce|Radeon|AMD|Intel\(R\) Arc/i;
// Integrated Intel UHD / Iris start in the middle (measured: UHD 620 holds 60 fps on
// MEDIUM but ~40 fps with stutter on HIGH with two imported characters).

/** Reads the facts (browser only). Each read is defensive: missing data is fine. */
export function readDeviceFacts({ window: win = globalThis.window } = {}) {
  const nav = win?.navigator ?? {};
  const facts = {
    cores: Number(nav.hardwareConcurrency) || null,
    memoryGb: Number(nav.deviceMemory) || null,
    devicePixelRatio: Number(win?.devicePixelRatio) || 1,
    screenPixels: Math.round((win?.screen?.width ?? 0) * (win?.screen?.height ?? 0) * (Number(win?.devicePixelRatio) || 1) ** 2),
    touchFirst: Boolean(win?.matchMedia?.("(pointer: coarse)")?.matches),
    webgl2: false,
    maxTextureSize: null,
    renderer: null,
  };
  try {
    const canvas = win.document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (gl) {
      facts.webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
      facts.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      facts.renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // no WebGL details → decide from the rest
  }
  return facts;
}

/** Facts → starting tier ("low" | "medium" | "high") and the reasons (diagnostics). */
export function assessTier(facts) {
  const reasons = [];
  if (facts.renderer && /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(facts.renderer)) {
    return { tier: "low", reasons: ["software renderer"] };
  }
  let score = 0;
  if (facts.touchFirst) {
    score -= 1;
    reasons.push("touch-first device");
  }
  if (facts.memoryGb !== null) {
    if (facts.memoryGb <= 4) {
      score -= 1;
      reasons.push(`${facts.memoryGb} GB memory`);
    } else if (facts.memoryGb >= 8) score += 1;
  }
  if (facts.cores !== null && facts.cores <= 4) {
    score -= 1;
    reasons.push(`${facts.cores} cores`);
  }
  if (facts.renderer && WEAK_GPU.test(facts.renderer)) {
    score -= 2;
    reasons.push("entry-level GPU");
  } else if (facts.renderer && STRONG_GPU.test(facts.renderer)) {
    score += 2;
  }
  if (!facts.webgl2) {
    score -= 1;
    reasons.push("no WebGL 2");
  }
  if (facts.maxTextureSize !== null && facts.maxTextureSize < 4096) score -= 1;
  if (score <= -2) return { tier: "low", reasons };

  // When uncertain, start safely and measure: HIGH only with confidence, i.e. a
  // known strong GPU on a non-touch device that also reports plenty of memory
  // and cores, WebGL 2 and large textures. Everything else starts at MEDIUM and
  // the governor upgrades after measuring sustained headroom.
  const confident =
    score >= 2 &&
    !facts.touchFirst &&
    facts.renderer !== null &&
    STRONG_GPU.test(facts.renderer) &&
    (facts.memoryGb ?? 0) >= 8 &&
    (facts.cores ?? 0) >= 8 &&
    facts.webgl2 &&
    (facts.maxTextureSize ?? 0) >= 8192;
  if (!confident && score >= 2) reasons.push("starting at medium until measured");
  return { tier: confident ? "high" : "medium", reasons };
}
