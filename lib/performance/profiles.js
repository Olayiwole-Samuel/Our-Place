/**
 * Rendering profiles — what each quality tier is allowed to spend. The same
 * world renders at every tier; tiers change cost, never content: the room,
 * both full-body characters, presence, chat, voice, emotes and the game menu
 * are present at every tier.
 *
 *   maxFps        frame cap. LOW holds a steady 30 rather than an uneven 60.
 *   renderScales  device-pixel-ratio steps the adaptive governor moves between
 *                 (always capped by the screen's real devicePixelRatio).
 *   antialias     MSAA — fixed when the canvas is created.
 *   shadows       "off" (soft blob shadows only) | "low" | "high": real shadows
 *                 from the key light, characters only.
 *   characterQuality  model characters: "low" = 512 px textures, colour maps only,
 *                 cheaper Lambert shading; "medium" = textures ≤ 1024, no AO maps;
 *                 "high" = as authored (≤ 2048).
 *   environment   decorative animation: "static" | "full"
 *   particleDensity / postProcessing  reserved: the world has no particles or
 *                 post-processing today; future effects must read these.
 *
 * Values were chosen from measurements on this scene (docs/performance.md);
 * the governor corrects them on each device at runtime.
 */
export const TIERS = Object.freeze(["low", "medium", "high"]);

export const PROFILES = Object.freeze({
  low: Object.freeze({
    tier: "low",
    maxFps: 30,
    renderScales: Object.freeze([1, 0.85, 0.75]),
    antialias: false,
    shadows: "off",
    characterQuality: "low",
    textureMax: 512,
    environment: "static",
    particleDensity: 0.25,
    postProcessing: false,
  }),
  medium: Object.freeze({
    tier: "medium",
    maxFps: 60,
    renderScales: Object.freeze([1.25, 1, 0.85]),
    antialias: false,
    shadows: "low",
    characterQuality: "medium",
    textureMax: 1024,
    environment: "full",
    particleDensity: 0.5,
    postProcessing: false,
  }),
  high: Object.freeze({
    tier: "high",
    maxFps: 60,
    renderScales: Object.freeze([1.75, 1.5, 1.25, 1]),
    antialias: true,
    shadows: "high",
    characterQuality: "high",
    textureMax: 2048,
    environment: "full",
    particleDensity: 1,
    postProcessing: false,
  }),
});

/** The user's choice (account menu → Graphics). "auto" lets the governor decide. */
export const GRAPHICS_PREFERENCES = Object.freeze([
  { id: "auto", label: "Auto", description: "Adjusts to your device as you play." },
  { id: "performance", label: "Performance", description: "Smoothest frame rate, longest battery." },
  { id: "balanced", label: "Balanced", description: "A good mix of looks and smoothness." },
  { id: "quality", label: "Quality", description: "Best visuals on stronger devices." },
]);

const PREFERENCE_TIER = { performance: "low", balanced: "medium", quality: "high" };

export function tierForPreference(preference, autoTier) {
  return PREFERENCE_TIER[preference] ?? autoTier;
}

export const lowerTier = (tier) => TIERS[Math.max(0, TIERS.indexOf(tier) - 1)];
export const higherTier = (tier) => TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(tier) + 1)];

/** Effective pixel ratio: never above the screen's own ratio. */
export function effectiveDpr(scale, devicePixelRatio = 1) {
  return Math.round(Math.min(scale, Math.max(1, devicePixelRatio)) * 100) / 100;
}
