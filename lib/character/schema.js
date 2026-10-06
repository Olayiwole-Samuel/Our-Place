import {
  BODY_RANGES,
  BROW_SHAPES,
  CHARACTER_VERSION,
  COLOR_TABLES,
  EAR_SHAPES,
  EYE_SHAPES,
  FACE_SHAPES,
  FACIAL_HAIR,
  FACIAL_MARKS,
  HAIRSTYLES,
  ITEMS_BY_ID,
  MOUTH_SHAPES,
  NOSE_SHAPES,
  SLOTS,
} from "./catalog";

/**
 * The Our Place Character Model (version 1).
 *
 * This is the app's own description of a person's look. Providers (MetaPerson,
 * future ones) are translated INTO this model by their adapter; the rest of the
 * app never reads provider payloads.
 *
 * {
 *   version: 1,
 *   body:   { height 0..1, build 0..1, shoulders 0..1 },   ← normalised, mapped to BODY_RANGES
 *   skin:   { tone },
 *   face:   { shape, eyes: { shape, size, spacing, color }, brows: { shape, thickness },
 *             nose: { shape, size }, mouth: { shape }, ears: { shape }, marks, facialHair },
 *   hair:   { style, color },
 *   outfit: { top, outfit, bottom, shoes }       ← item ids or null; colours per item
 *   accessories: { glasses, earrings, necklace, wrist, hat },
 *   colors: { [slot]: fabricColorId }
 * }
 *
 * `normalizeCharacterConfig` is the single gatekeeper used by the client (live
 * preview), the API (before saving) and the renderer (before drawing): unknown
 * ids are replaced with defaults, numbers are clamped to 0..1, and slot rules are
 * enforced (an outfit replaces top + bottom). Nothing out of range can be saved
 * or rendered.
 */

export const DEFAULT_CHARACTER = Object.freeze({
  version: CHARACTER_VERSION,
  body: { height: 0.5, build: 0.45, shoulders: 0.5 },
  skin: { tone: "honey" },
  face: {
    shape: "oval",
    eyes: { shape: "almond", size: 0.5, spacing: 0.5, color: "brown" },
    brows: { shape: "soft", thickness: 0.5 },
    nose: { shape: "straight", size: 0.5 },
    mouth: { shape: "soft" },
    ears: { shape: "round" },
    marks: "none",
    facialHair: "none",
  },
  hair: { style: "short_crop", color: "dark_brown" },
  outfit: { top: "hoodie", outfit: null, bottom: "trousers", shoes: "sneakers" },
  accessories: { glasses: null, earrings: null, necklace: null, wrist: null, hat: null },
  colors: { top: "army_green", bottom: "black", shoes: "white" },
});

/** Distinct starting looks for "Design your look" (no photo needed). */
export const STARTING_LOOKS = Object.freeze([
  { id: "easy", name: "Easygoing", patch: { skin: { tone: "honey" }, hair: { style: "short_crop", color: "dark_brown" } } },
  {
    id: "soft",
    name: "Soft",
    patch: {
      skin: { tone: "fair" },
      hair: { style: "long_waves", color: "brown" },
      outfit: { top: "long_sleeve", bottom: "skirt", shoes: "sneakers" },
      colors: { top: "soft_pink", bottom: "black", shoes: "white" },
      accessories: { earrings: "studs" },
    },
  },
  {
    id: "classic",
    name: "Classic",
    patch: {
      skin: { tone: "espresso" },
      hair: { style: "afro", color: "black" },
      face: { facialHair: "stubble" },
      outfit: { top: "jacket", bottom: "jeans", shoes: "boots" },
      colors: { top: "black", bottom: "denim", shoes: "black" },
      accessories: { wrist: "watch" },
    },
  },
  {
    id: "sunday",
    name: "Sunday",
    patch: {
      skin: { tone: "light" },
      hair: { style: "bun", color: "blonde" },
      outfit: { top: null, outfit: "dress", bottom: null, shoes: "loafers" },
      colors: { outfit: "army_green", shoes: "tan" },
      accessories: { necklace: "pendant_heart", glasses: "glasses_round" },
    },
  },
  {
    id: "bold",
    name: "Bold",
    patch: {
      skin: { tone: "chestnut" },
      hair: { style: "locs", color: "black" },
      face: { facialHair: "beard" },
      outfit: { top: "tee", bottom: "shorts", shoes: "sneakers" },
      colors: { top: "sky", bottom: "army_green", shoes: "black" },
      accessories: { hat: "cap" },
    },
  },
  {
    id: "cozy",
    name: "Cozy",
    patch: {
      skin: { tone: "caramel" },
      hair: { style: "braids", color: "dark_brown" },
      outfit: { top: "hoodie", bottom: "trousers", shoes: "sneakers" },
      colors: { top: "soft_pink", bottom: "charcoal", shoes: "white" },
      accessories: { earrings: "hoops" },
    },
  },
]);

const clamp01 = (value, fallback) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const colorOf = (table, value, fallback) => (COLOR_TABLES[table].has(value) ? value : fallback);
const HAIRSTYLE_IDS = HAIRSTYLES.map((style) => style.id);

function itemFor(slot, value) {
  if (value === null || value === undefined) return null;
  const item = ITEMS_BY_ID.get(value);
  // Locked items (future rewards) can't be equipped until their unlock system exists.
  return item && item.slot === slot && !item.unlock ? item.id : undefined;
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = value && typeof value === "object" && !Array.isArray(value) && base?.[key] && typeof base[key] === "object" ? deepMerge(base[key], value) : value;
  }
  return out;
}

/** Applies a partial change (e.g. from a studio control) on top of a config. */
export function applyCharacterPatch(config, patch) {
  return normalizeCharacterConfig(deepMerge(normalizeCharacterConfig(config), patch));
}

export function normalizeCharacterConfig(input) {
  const raw = input && typeof input === "object" ? input : {};
  const d = DEFAULT_CHARACTER;
  const face = raw.face ?? {};
  const outfitIn = raw.outfit ?? {};
  const accessoriesIn = raw.accessories ?? {};
  const colorsIn = raw.colors ?? {};

  const outfit = {};
  for (const slot of ["top", "outfit", "bottom", "shoes"]) {
    const chosen = itemFor(slot, outfitIn[slot]);
    outfit[slot] = chosen === undefined ? d.outfit[slot] : chosen;
  }
  // A full outfit replaces top and bottom; otherwise both must be present.
  if (outfit.outfit) {
    outfit.top = null;
    outfit.bottom = null;
  } else {
    outfit.top ??= d.outfit.top;
    outfit.bottom ??= d.outfit.bottom;
  }
  outfit.shoes ??= d.outfit.shoes;

  const accessories = {};
  for (const slot of ["glasses", "earrings", "necklace", "wrist", "hat"]) {
    const chosen = itemFor(slot, accessoriesIn[slot]);
    accessories[slot] = chosen === undefined ? null : chosen;
  }

  // Each equipped item gets a colour the item actually offers.
  const colors = {};
  for (const { id: slot } of SLOTS) {
    const itemId = outfit[slot] ?? accessories[slot];
    if (!itemId) continue;
    const item = ITEMS_BY_ID.get(itemId);
    colors[slot] = item.colors.includes(colorsIn[slot]) ? colorsIn[slot] : item.colors[0];
  }

  return {
    version: CHARACTER_VERSION,
    body: {
      height: clamp01(raw.body?.height, d.body.height),
      build: clamp01(raw.body?.build, d.body.build),
      shoulders: clamp01(raw.body?.shoulders, d.body.shoulders),
    },
    skin: { tone: colorOf("skin", raw.skin?.tone, d.skin.tone) },
    face: {
      shape: oneOf(face.shape, FACE_SHAPES, d.face.shape),
      eyes: {
        shape: oneOf(face.eyes?.shape, EYE_SHAPES, d.face.eyes.shape),
        size: clamp01(face.eyes?.size, d.face.eyes.size),
        spacing: clamp01(face.eyes?.spacing, d.face.eyes.spacing),
        color: colorOf("eyes", face.eyes?.color, d.face.eyes.color),
      },
      brows: {
        shape: oneOf(face.brows?.shape, BROW_SHAPES, d.face.brows.shape),
        thickness: clamp01(face.brows?.thickness, d.face.brows.thickness),
      },
      nose: { shape: oneOf(face.nose?.shape, NOSE_SHAPES, d.face.nose.shape), size: clamp01(face.nose?.size, d.face.nose.size) },
      mouth: { shape: oneOf(face.mouth?.shape, MOUTH_SHAPES, d.face.mouth.shape) },
      ears: { shape: oneOf(face.ears?.shape, EAR_SHAPES, d.face.ears.shape) },
      marks: oneOf(face.marks, FACIAL_MARKS, d.face.marks),
      facialHair: oneOf(face.facialHair, FACIAL_HAIR, d.face.facialHair),
    },
    hair: {
      style: oneOf(raw.hair?.style, HAIRSTYLE_IDS, d.hair.style),
      color: colorOf("hair", raw.hair?.color, d.hair.color),
    },
    outfit,
    accessories,
    colors,
  };
}

/** Physical body dimensions (metres / multipliers) for a normalised config. */
export function bodyDimensions(config) {
  const { height, build, shoulders } = normalizeCharacterConfig(config).body;
  const lerp = (range, t) => range.min + (range.max - range.min) * t;
  return {
    height: lerp(BODY_RANGES.height, height),
    build: lerp(BODY_RANGES.build, build),
    shoulders: lerp(BODY_RANGES.shoulders, shoulders),
  };
}

/** True when two configs describe the same look (for "unsaved changes"). */
export function sameCharacter(a, b) {
  return JSON.stringify(normalizeCharacterConfig(a)) === JSON.stringify(normalizeCharacterConfig(b));
}
