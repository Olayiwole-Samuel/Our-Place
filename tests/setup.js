import { afterEach } from "vitest";

// jsdom has no matchMedia; components read it for reduced-motion / pointer type.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  });
}

// Component tests assert states, not tweens: finish Motion animations instantly
// (jsdom has no layout/compositor, and exit animations otherwise stall).
if (typeof window !== "undefined") {
  const { MotionGlobalConfig } = await import("motion/react");
  MotionGlobalConfig.skipAnimations = true;
}

// Unmount React trees between component tests (jsdom files only).
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
