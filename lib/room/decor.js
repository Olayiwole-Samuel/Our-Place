/**
 * Things you can place in the living room (Decorate). Pure data + geometry,
 * shared by the 3D room, Decorate's tray and placement checks, the dog's path
 * finding, and the database's prices (private.decor_cost() in
 * supabase/migrations/20261023000000_pet_and_decor.sql — a test keeps them equal).
 *
 *   cost       hearts to unlock the item for good (0 = free); once unlocked you
 *              can place it as often as `max` allows
 *   size       [width, depth] in metres, at rotation 0
 *   block      "box" | "circle" | "none" — whether you (and the dog) walk around it
 *   dog        what the dog uses it for: "house" | "bed" | "bowl" | "toys"
 */
export const DECOR_CATEGORIES = [
  { id: "dog", label: "Dog" },
  { id: "rugs", label: "Rugs" },
  { id: "seating", label: "Seats" },
  { id: "tables", label: "Tables" },
  { id: "lights", label: "Lights" },
  { id: "plants", label: "Plants" },
  { id: "fun", label: "Fun" },
];

const item = (id, name, icon, category, cost, size, block, extra = {}) => ({ id, name, icon, category, cost, size, block, max: 6, ...extra });

export const DECOR_ITEMS = [
  item("dog_house", "Dog house", "🏠", "dog", 0, [0.9, 0.8], "box", { max: 1, dog: "house" }),
  item("dog_bed", "Dog bed", "🛏️", "dog", 0, [0.7, 0.55], "none", { max: 2, dog: "bed" }),
  item("dog_bowl", "Food & water bowls", "🥣", "dog", 0, [0.42, 0.22], "none", { max: 2, dog: "bowl" }),
  item("dog_toys", "Toy basket", "🧸", "dog", 0, [0.42, 0.32], "none", { max: 2, dog: "toys" }),

  item("round_rug", "Round rug", "⭕", "rugs", 0, [2, 2], "none"),
  item("fluffy_rug", "Fluffy rug", "☁️", "rugs", 60, [1.7, 1.1], "none"),
  item("heart_rug", "Heart rug", "💗", "rugs", 120, [1.4, 1.3], "none"),

  item("floor_cushions", "Floor cushions", "🟣", "seating", 0, [1, 0.6], "none"),
  item("bean_bag", "Bean bag", "🫘", "seating", 80, [0.8, 0.8], "circle"),
  item("armchair", "Armchair", "🪑", "seating", 150, [0.9, 0.85], "box"),
  item("loveseat", "Loveseat", "🛋️", "seating", 250, [1.6, 0.85], "box", { max: 2 }),

  item("side_table", "Side table", "⚪", "tables", 60, [0.5, 0.5], "circle"),
  item("dinner_table", "Dinner for two", "🕯️", "tables", 200, [1.3, 1.1], "box", { max: 2 }),

  item("candles", "Candles", "🕯️", "lights", 40, [0.4, 0.3], "none"),
  item("lantern", "Lantern", "🏮", "lights", 50, [0.3, 0.3], "circle"),
  item("warm_lamp", "Warm lamp", "💡", "lights", 80, [0.45, 0.45], "circle"),

  item("small_plant", "Small plant", "🪴", "plants", 0, [0.4, 0.4], "circle"),
  item("cactus", "Cactus", "🌵", "plants", 40, [0.3, 0.3], "circle"),
  item("flower_vase", "Flowers", "💐", "plants", 50, [0.35, 0.35], "circle"),
  item("monstera", "Big plant", "🌿", "plants", 90, [0.75, 0.75], "circle"),

  item("teddy_bear", "Teddy bear", "🧸", "fun", 70, [0.45, 0.4], "circle"),
  item("bookshelf_small", "Bookshelf", "📚", "fun", 100, [0.9, 0.35], "box", { max: 3 }),
  item("guitar", "Guitar", "🎸", "fun", 120, [0.4, 0.35], "circle", { max: 2 }),
  item("record_player", "Record player", "🎶", "fun", 180, [0.7, 0.45], "box", { max: 1 }),
  item("aquarium", "Aquarium", "🐠", "fun", 300, [1.1, 0.45], "box", { max: 1 }),
];

export const DECOR = Object.fromEntries(DECOR_ITEMS.map((entry) => [entry.id, entry]));
export const MAX_DECOR = 60;
export const ROTATION_STEP = Math.PI / 4;

/** The free-standing footprint of a placed item: { halfWidth, halfDepth } in world axes. */
export function footprint(entry, rotation = 0) {
  const [w, d] = entry.size;
  const quarter = Math.round(rotation / (Math.PI / 2));
  const square = Math.abs(rotation - quarter * (Math.PI / 2)) < 0.01;
  if (square) return quarter % 2 === 0 ? { halfWidth: w / 2, halfDepth: d / 2 } : { halfWidth: d / 2, halfDepth: w / 2 };
  const half = Math.max(w, d) / 2; // 45°: the rotated box fits in this square
  return { halfWidth: half * 0.85, halfDepth: half * 0.85 };
}

/** Walking colliders for placed items (collision.js shapes). */
export function decorColliders(placed) {
  const colliders = [];
  for (const thing of placed) {
    const entry = DECOR[thing.item];
    if (!entry || entry.block === "none") continue;
    if (entry.block === "circle") colliders.push({ shape: "circle", x: thing.x, z: thing.z, radius: Math.max(...entry.size) / 2 });
    else colliders.push({ shape: "box", x: thing.x, z: thing.z, ...footprint(entry, thing.rotation) });
  }
  return colliders;
}

const overlaps = (a, b) => Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth && Math.abs(a.z - b.z) < a.halfDepth + b.halfDepth;
const boxOf = (collider) => (collider.shape === "circle" ? { x: collider.x, z: collider.z, halfWidth: collider.radius, halfDepth: collider.radius } : collider);

/**
 * Can `entry` go at (x, z, rotation)? Inside the room, and (unless it's a rug)
 * not on top of furniture or of the spots where you stand to use the room's
 * things. `others` are the room's colliders + other placed items'.
 * Returns null or a short reason.
 */
export function placementProblem(entry, { x, z, rotation = 0 }, { bounds, colliders = [], keepClear = [] }) {
  const box = { x, z, ...footprint(entry, rotation) };
  if (box.x - box.halfWidth < bounds.minX || box.x + box.halfWidth > bounds.maxX || box.z - box.halfDepth < bounds.minZ || box.z + box.halfDepth > bounds.maxZ) return "Keep it inside the room";
  if (entry.category === "rugs") return null; // rugs go under things
  if (colliders.some((collider) => overlaps(box, boxOf(collider)))) return "Something's already there";
  if (keepClear.some((spot) => overlaps(box, { x: spot.x, z: spot.z, halfWidth: 0.35, halfDepth: 0.35 }))) return "That spot needs to stay free";
  return null;
}

/** Placed items the dog uses, nearest first from (x, z). */
export function dogSpots(placed, kind, from = { x: 0, z: 0 }) {
  return placed
    .filter((thing) => DECOR[thing.item]?.dog === kind)
    .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
}
