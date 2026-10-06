import { palette } from "@/lib/design/tokens";

/**
 * Lighting presets by time of day. The room reads one preset object, so a future
 * system (real clock, user choice, room evolution, weather) only has to pick or
 * blend presets — no lighting code changes.
 *
 * The key light comes from the window side (−x). Colours come from the identity
 * palette: the sky is blue (day → dusk → night), and the room's warmth comes from
 * soft white blended with a little pink in the lamp — never pink scenery.
 */
export const TIME_OF_DAY = Object.freeze({
  morning: {
    id: "morning",
    background: palette.black800,
    sky: palette.blue400,
    skyIntensity: 0.9,
    ambient: { color: palette.whiteSoft, ground: palette.black900, intensity: 0.75 },
    key: { color: palette.white, intensity: 1.5, position: [-5, 6, 3] },
    lamp: { intensity: 2 },
    accent: { intensity: 1.5 },
    warmth: 0.05,
  },
  afternoon: {
    id: "afternoon",
    background: palette.black800,
    sky: palette.blue500,
    skyIntensity: 1,
    ambient: { color: palette.whiteSoft, ground: palette.black900, intensity: 0.8 },
    key: { color: palette.whiteSoft, intensity: 1.6, position: [-4, 7, 2] },
    lamp: { intensity: 2 },
    accent: { intensity: 1.5 },
    warmth: 0.08,
  },
  evening: {
    id: "evening",
    background: palette.black950,
    sky: palette.blue600,
    skyIntensity: 0.22,
    ambient: { color: palette.whiteSoft, ground: palette.black950, intensity: 0.5 },
    key: { color: palette.whiteSoft, intensity: 0.7, position: [-4, 5, 3] },
    lamp: { intensity: 9 },
    accent: { intensity: 3 },
    warmth: 0.22,
  },
  night: {
    id: "night",
    background: palette.black950,
    sky: palette.blue600,
    skyIntensity: 0.07,
    ambient: { color: palette.textSecondary, ground: palette.black950, intensity: 0.35 },
    key: { color: palette.blue400, intensity: 0.25, position: [-4, 5, 3] },
    lamp: { intensity: 11 },
    accent: { intensity: 3.5 },
    warmth: 0.28,
  },
});

/** Picks the preset for a local time. */
export function timeOfDayFor(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return TIME_OF_DAY.morning;
  if (hour >= 11 && hour < 17) return TIME_OF_DAY.afternoon;
  if (hour >= 17 && hour < 21) return TIME_OF_DAY.evening;
  return TIME_OF_DAY.night;
}
