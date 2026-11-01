/**
 * The bedroom, off the hallway: a big bed you can both lie on (under the
 * duvet, heads on the pillows), nightstands with lamps, a window onto the night
 * sky where shooting stars go by (make a wish), the dog's bed at the foot,
 * and somewhere for sleep sounds. Same shape of data as livingRoom.js.
 *
 *            BACK (z = -3): nightstand · BED (headboard) · nightstand
 *     sky window                                         wardrobe
 *                     dog bed       rug
 *                  door to the hallway (z = +3)
 *
 * The bed's `spots` are where each of you lies (your slot): the feet, facing
 * so the head is toward the headboard; `getUp` is where you stand afterwards.
 */
const HALF = Math.PI / 2;

export const BED_TOP = 0.56; // the mattress, metres above the floor
export const BED = Object.freeze({ x: 0, z: -1.85, halfWidth: 0.95, halfDepth: 1.1 });

export const bedroom = Object.freeze({
  id: "bedroom",
  name: "Bedroom",
  size: { width: 6, depth: 6, height: 2.9 },
  bounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 },
  spawnPoints: { 1: { x: 0, z: 2.0, ry: Math.PI }, 2: { x: 0, z: 2.0, ry: Math.PI } },
  lighting: "evening",
  window: null,
  shell: { wall: "#2c2433", wainscot: "#3a2f45", floor: "#5a4232" },
  accentLight: [0, 2.4, -0.5],
  objects: [
    {
      id: "bedroom_hall",
      type: "door",
      position: [0, 2.98],
      rotation: Math.PI,
      sign: "Hallway",
      interaction: { label: "Hallway", verb: "Go", radius: 1.1, offset: [0, -0.7] },
      destination: { room: "hallway", door: "hall_bedroom" },
      arrive: { x: 0, z: 1.9, ry: Math.PI },
    },
    {
      id: "bed",
      type: "bed",
      position: [BED.x, BED.z],
      rotation: 0,
      collider: { shape: "box", halfWidth: BED.halfWidth, halfDepth: BED.halfDepth },
      interaction: { label: "Bed", verb: "Lie down", radius: 1.5, offset: [0, 1.45] },
      spots: {
        1: { x: -0.42, z: -1.12, ry: 0 },
        2: { x: 0.42, z: -1.12, ry: 0 },
      },
      getUp: {
        1: { x: -1.4, z: -1.2, ry: -HALF },
        2: { x: 1.4, z: -1.2, ry: HALF },
      },
    },
    {
      id: "nightstand_left",
      type: "nightstand",
      position: [-1.35, -2.72],
      rotation: 0,
      collider: { shape: "box", halfWidth: 0.25, halfDepth: 0.22 },
      interaction: { label: "Sleep sounds", verb: "Open", radius: 0.9, offset: [0, 0.65] },
    },
    {
      id: "nightstand_right",
      type: "nightstand",
      position: [1.35, -2.72],
      rotation: 0,
      variant: 1,
      collider: { shape: "box", halfWidth: 0.25, halfDepth: 0.22 },
      interaction: { label: "Goodnight", verb: "Say", radius: 0.9, offset: [0, 0.65] },
    },
    {
      id: "sky_window",
      type: "skyWindow",
      position: [-2.97, -0.4],
      rotation: HALF,
      interaction: { label: "The night sky", verb: "Watch", radius: 1.3, offset: [0.9, 0] },
    },
    { id: "wardrobe", type: "wardrobe", position: [2.7, 0.6], rotation: -HALF, collider: { shape: "box", halfWidth: 0.3, halfDepth: 0.65 } },
    { id: "bedroom_rug", type: "decorPiece", item: "fluffy_rug", position: [0, 0.15], rotation: 0 },
    { id: "bedroom_dog_bed", type: "decorPiece", item: "dog_bed", position: [0.95, 0.2], rotation: -0.3 },
    { id: "bedroom_teddy", type: "decorPiece", item: "teddy_bear", position: [-2.5, -2.55], rotation: 0.5, collider: { shape: "circle", radius: 0.22 } },
    { id: "bedroom_plant", type: "decorPiece", item: "monstera", position: [-2.5, 2.45], rotation: 0, collider: { shape: "circle", radius: 0.38 } },
    { id: "bedroom_candles", type: "decorPiece", item: "candles", position: [2.45, -2.55], rotation: 0 },
    { id: "bedroom_stars", type: "starCeiling", position: [0, 0], rotation: 0 },
  ],
});
