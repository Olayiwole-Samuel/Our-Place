/**
 * The Our Place character catalog — pure data.
 *
 * Every customisation option the studio offers and the renderer understands is
 * listed here. The renderer maps `shape` keys to geometry builders; nothing about
 * individual items is hard-coded in rendering code, so new items (seasonal
 * outfits, couple outfits, game rewards) are added here.
 *
 * `unlock` is reserved for later reward systems ({ type: "achievement" | "streak"
 * | "event" | "milestone", id }). Items with an unlock are hidden and rejected by
 * validation until that system exists — nothing is purchasable or awardable yet.
 *
 * Colours here are character colours (skin, hair, fabric), deliberately separate
 * from the UI design tokens: people need realistic skin and hair tones, and
 * clothing leans on the brand palette plus neutrals.
 */

export const CHARACTER_VERSION = 1;

// ── Colours ─────────────────────────────────────────────────────────────────

export const SKIN_TONES = Object.freeze([
  { id: "porcelain", name: "Porcelain", hex: "#f6dfd1" },
  { id: "fair", name: "Fair", hex: "#eccab1" },
  { id: "light", name: "Light", hex: "#dfb48f" },
  { id: "warm_beige", name: "Warm beige", hex: "#cf9c72" },
  { id: "honey", name: "Honey", hex: "#bb8456" },
  { id: "caramel", name: "Caramel", hex: "#a06a40" },
  { id: "bronze", name: "Bronze", hex: "#8a5732" },
  { id: "chestnut", name: "Chestnut", hex: "#6f4426" },
  { id: "espresso", name: "Espresso", hex: "#55321d" },
  { id: "deep", name: "Deep", hex: "#3d2416" },
]);

export const HAIR_COLORS = Object.freeze([
  { id: "black", name: "Black", hex: "#16130f" },
  { id: "dark_brown", name: "Dark brown", hex: "#3a2618" },
  { id: "brown", name: "Brown", hex: "#5e3b22" },
  { id: "auburn", name: "Auburn", hex: "#7a3a1f" },
  { id: "copper", name: "Copper", hex: "#a5512a" },
  { id: "blonde", name: "Blonde", hex: "#c9a46a" },
  { id: "platinum", name: "Platinum", hex: "#e5dcc8" },
  { id: "grey", name: "Grey", hex: "#9a9a96" },
  { id: "pink", name: "Soft pink", hex: "#e889a2" },
  { id: "army_green", name: "Army green", hex: "#4f5f3a" },
]);

export const EYE_COLORS = Object.freeze([
  { id: "dark_brown", name: "Dark brown", hex: "#2b1a10" },
  { id: "brown", name: "Brown", hex: "#5a3a1e" },
  { id: "hazel", name: "Hazel", hex: "#7a6a35" },
  { id: "green", name: "Green", hex: "#4d6b45" },
  { id: "blue", name: "Blue", hex: "#4f7fa6" },
  { id: "grey", name: "Grey", hex: "#7c8790" },
]);

/** Fabric colours: brand palette first, then neutrals. */
export const FABRIC_COLORS = Object.freeze([
  { id: "black", name: "Black", hex: "#171a17" },
  { id: "charcoal", name: "Charcoal", hex: "#2e322e" },
  { id: "army_green", name: "Army green", hex: "#596b40" },
  { id: "olive", name: "Olive", hex: "#66764a" },
  { id: "soft_pink", name: "Soft pink", hex: "#e889a2" },
  { id: "sky", name: "Sky blue", hex: "#67c7f2" },
  { id: "white", name: "White", hex: "#f5f5f2" },
  { id: "stone", name: "Stone", hex: "#c9c4b8" },
  { id: "denim", name: "Denim", hex: "#3f5670" },
  { id: "tan", name: "Tan", hex: "#a9895f" },
  { id: "red", name: "Red", hex: "#c23b3b" },
]);

// ── Face ────────────────────────────────────────────────────────────────────

export const FACE_SHAPES = Object.freeze(["oval", "round", "square", "heart", "long"]);
export const EYE_SHAPES = Object.freeze(["almond", "round", "soft", "narrow"]);
export const BROW_SHAPES = Object.freeze(["straight", "arched", "soft", "bold"]);
export const NOSE_SHAPES = Object.freeze(["button", "straight", "wide", "narrow"]);
export const MOUTH_SHAPES = Object.freeze(["soft", "full", "wide", "small"]);
export const EAR_SHAPES = Object.freeze(["round", "small", "pointed"]);
export const FACIAL_MARKS = Object.freeze(["none", "beauty_mark", "freckles", "freckles_light"]);
export const FACIAL_HAIR = Object.freeze(["none", "stubble", "mustache", "goatee", "beard"]);

// ── Hair ────────────────────────────────────────────────────────────────────

export const HAIRSTYLES = Object.freeze([
  { id: "buzz", name: "Buzz", shape: "buzz" },
  { id: "short_crop", name: "Short crop", shape: "crop" },
  { id: "side_part", name: "Side part", shape: "sidePart" },
  { id: "curly_top", name: "Curly top", shape: "curlyTop" },
  { id: "afro", name: "Afro", shape: "afro" },
  { id: "locs", name: "Locs", shape: "locs" },
  { id: "bob", name: "Bob", shape: "bob" },
  { id: "long_straight", name: "Long", shape: "long" },
  { id: "long_waves", name: "Long waves", shape: "waves" },
  { id: "bun", name: "Bun", shape: "bun" },
  { id: "braids", name: "Braids", shape: "braids" },
  { id: "bald", name: "Bald", shape: "none" },
]);

// ── Clothing & accessories (slots) ──────────────────────────────────────────
// `shape` → geometry builder in components/character/parts. `colors` → allowed
// FABRIC_COLORS ids (first is the default). `covers` documents body coverage.

export const ITEMS = Object.freeze([
  // Tops
  { id: "tee", slot: "top", name: "T-shirt", shape: "tee", covers: ["torso", "upperArms"], colors: ["white", "black", "army_green", "soft_pink", "sky", "stone"] },
  { id: "long_sleeve", slot: "top", name: "Long sleeve", shape: "longSleeve", covers: ["torso", "arms"], colors: ["black", "white", "olive", "charcoal", "soft_pink"] },
  { id: "hoodie", slot: "top", name: "Hoodie", shape: "hoodie", covers: ["torso", "arms"], colors: ["army_green", "black", "charcoal", "soft_pink", "stone", "sky"] },
  { id: "shirt", slot: "top", name: "Shirt", shape: "shirt", covers: ["torso", "arms"], colors: ["white", "denim", "stone", "sky", "black"] },
  { id: "jacket", slot: "top", name: "Jacket", shape: "jacket", covers: ["torso", "arms"], colors: ["black", "army_green", "tan", "denim", "charcoal"] },
  { id: "tank", slot: "top", name: "Tank top", shape: "tank", covers: ["torso"], colors: ["white", "black", "soft_pink", "army_green"] },
  // Full outfits (replace top + bottom)
  { id: "dress", slot: "outfit", name: "Dress", shape: "dress", covers: ["torso", "pelvis", "upperLegs"], colors: ["black", "soft_pink", "army_green", "white", "red", "sky"] },
  // Bottoms
  { id: "trousers", slot: "bottom", name: "Trousers", shape: "trousers", covers: ["pelvis", "legs"], colors: ["black", "charcoal", "stone", "army_green", "tan"] },
  { id: "jeans", slot: "bottom", name: "Jeans", shape: "trousers", covers: ["pelvis", "legs"], colors: ["denim", "black", "charcoal"] },
  { id: "shorts", slot: "bottom", name: "Shorts", shape: "shorts", covers: ["pelvis", "upperLegs"], colors: ["stone", "black", "army_green", "denim"] },
  { id: "skirt", slot: "bottom", name: "Skirt", shape: "skirt", covers: ["pelvis", "upperLegs"], colors: ["black", "soft_pink", "army_green", "denim", "white"] },
  // Shoes
  { id: "sneakers", slot: "shoes", name: "Sneakers", shape: "sneakers", covers: ["feet"], colors: ["white", "black", "army_green", "soft_pink"] },
  { id: "boots", slot: "shoes", name: "Boots", shape: "boots", covers: ["feet", "ankles"], colors: ["black", "tan", "charcoal"] },
  { id: "loafers", slot: "shoes", name: "Loafers", shape: "loafers", covers: ["feet"], colors: ["black", "tan"] },
  // Accessories
  { id: "glasses_round", slot: "glasses", name: "Round glasses", shape: "glassesRound", colors: ["black", "tan", "stone"] },
  { id: "glasses_square", slot: "glasses", name: "Square glasses", shape: "glassesSquare", colors: ["black", "charcoal", "tan"] },
  { id: "sunglasses", slot: "glasses", name: "Sunglasses", shape: "sunglasses", colors: ["black", "tan"] },
  { id: "studs", slot: "earrings", name: "Studs", shape: "studs", colors: ["stone", "white", "soft_pink"] },
  { id: "hoops", slot: "earrings", name: "Hoops", shape: "hoops", colors: ["stone", "white", "black"] },
  { id: "chain", slot: "necklace", name: "Chain", shape: "chain", colors: ["stone", "white", "black"] },
  { id: "pendant_heart", slot: "necklace", name: "Heart pendant", shape: "pendantHeart", colors: ["soft_pink", "stone", "white"] },
  { id: "watch", slot: "wrist", name: "Watch", shape: "watch", colors: ["black", "stone", "tan"] },
  { id: "bracelet", slot: "wrist", name: "Bracelet", shape: "bracelet", colors: ["stone", "soft_pink", "black"] },
  { id: "beanie", slot: "hat", name: "Beanie", shape: "beanie", colors: ["black", "army_green", "soft_pink", "charcoal", "white"] },
  { id: "cap", slot: "hat", name: "Cap", shape: "cap", colors: ["black", "army_green", "white", "sky"] },
]);

/** Slots, in studio order. `required` slots always hold an item. */
export const SLOTS = Object.freeze([
  { id: "top", name: "Tops", category: "clothes", required: false },
  { id: "outfit", name: "Full outfits", category: "clothes", required: false },
  { id: "bottom", name: "Bottoms", category: "clothes", required: false },
  { id: "shoes", name: "Shoes", category: "clothes", required: true },
  { id: "glasses", name: "Glasses", category: "accessories", required: false },
  { id: "earrings", name: "Earrings", category: "accessories", required: false },
  { id: "necklace", name: "Necklaces", category: "accessories", required: false },
  { id: "wrist", name: "Watches & bracelets", category: "accessories", required: false },
  { id: "hat", name: "Hats", category: "accessories", required: false },
]);

/** Body proportions: normalised 0..1 sliders mapped to SAFE physical ranges. */
export const BODY_RANGES = Object.freeze({
  // Total height in metres (head to sole). The living room, couch and camera are
  // tuned for this range; animations scale with it.
  height: { min: 1.52, max: 1.9 },
  // Torso/limb girth multiplier.
  build: { min: 0.85, max: 1.22 },
  // Shoulder width multiplier.
  shoulders: { min: 0.88, max: 1.15 },
});

export const STUDIO_CATEGORIES = Object.freeze([
  { id: "face", name: "Face", sections: ["skin", "shape", "eyes", "brows", "nose", "mouth", "ears", "details", "facialHair"] },
  { id: "body", name: "Body", sections: ["height", "build", "shoulders"] },
  { id: "hair", name: "Hair", sections: ["style", "color"] },
  { id: "clothes", name: "Clothes", sections: ["top", "outfit", "bottom", "shoes"] },
  { id: "accessories", name: "Accessories", sections: ["glasses", "earrings", "necklace", "wrist", "hat"] },
]);

const byId = (list) => new Map(list.map((entry) => [typeof entry === "string" ? entry : entry.id, entry]));
export const ITEMS_BY_ID = byId(ITEMS);
export const COLOR_TABLES = {
  skin: byId(SKIN_TONES),
  hair: byId(HAIR_COLORS),
  eyes: byId(EYE_COLORS),
  fabric: byId(FABRIC_COLORS),
};

export function itemsForSlot(slot) {
  return ITEMS.filter((item) => item.slot === slot && !item.unlock);
}

export function colorHex(table, id) {
  return COLOR_TABLES[table].get(id)?.hex ?? null;
}
