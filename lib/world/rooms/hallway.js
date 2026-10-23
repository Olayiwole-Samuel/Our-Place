/**
 * The hallway behind the living room's door: a short corridor with a labelled
 * door to each room. Same shape of data as livingRoom.js; rendered by Room.jsx.
 *
 *            BACK (z = -4.5): window
 *    plant                        lamp
 *    Game room door      Range door
 *       (pictures)        (pictures)
 *    Bedroom (soon)      Balcony (soon)
 *            living room door (z = +4.5)
 *
 * Doors: `destination` = { room, door } (the door you come out of over there),
 * `arrive` = where you stand when you come in through this door, facing in.
 */
const HALF = Math.PI / 2;

export const hallway = Object.freeze({
  id: "hallway",
  name: "Hallway",
  size: { width: 2.8, depth: 9, height: 3.0 },
  bounds: { minX: -1.4, maxX: 1.4, minZ: -4.5, maxZ: 4.5 },
  spawnPoints: { 1: { x: 0, z: 3.6, ry: Math.PI }, 2: { x: 0, z: 3.6, ry: Math.PI } },
  lighting: "auto",
  window: { position: [0, 1.7, -4.47], rotationY: 0 },
  shell: { wall: "#2a3226", wainscot: "#3c4a33" },
  accentLight: [0, 2.5, 0],
  objects: [
    {
      id: "hall_living",
      type: "door",
      position: [0, 4.48],
      rotation: Math.PI,
      sign: "Living room",
      interaction: { label: "Living room", verb: "Go", radius: 1.1, offset: [0, -0.7] },
      destination: { room: "living_room", door: "door" },
      arrive: { x: 0, z: 3.0, ry: Math.PI },
    },
    {
      id: "hall_game",
      type: "door",
      position: [-1.38, -0.6],
      rotation: HALF,
      sign: "Game room 🎮",
      interaction: { label: "Game room", verb: "Go", radius: 1.0, offset: [0.65, 0] },
      destination: { room: "game_room", door: "game_hall" },
      arrive: { x: -0.7, z: -0.6, ry: HALF },
    },
    {
      id: "hall_range",
      type: "door",
      position: [1.38, -0.6],
      rotation: -HALF,
      sign: "Range 🎯",
      interaction: { label: "Range", verb: "Go", radius: 1.0, offset: [-0.65, 0] },
      destination: { room: "range_room", door: "range_hall" },
      arrive: { x: 0.7, z: -0.6, ry: -HALF },
    },
    {
      id: "hall_bedroom",
      type: "soonDoor",
      position: [-1.38, 2.3],
      rotation: HALF,
      sign: "Bedroom · soon",
      interaction: { label: "Bedroom", verb: "Look", radius: 1.0, offset: [0.65, 0] },
    },
    {
      id: "hall_balcony",
      type: "soonDoor",
      position: [1.38, 2.3],
      rotation: -HALF,
      sign: "Balcony · soon",
      interaction: { label: "Balcony", verb: "Look", radius: 1.0, offset: [-0.65, 0] },
    },
    { id: "hall_runner", type: "runner", position: [0, 0], rotation: 0 },
    {
      id: "hall_art_left",
      type: "artFrames",
      position: [-1.39, 0.85],
      rotation: HALF,
      interaction: { label: "Pictures", verb: "Choose", radius: 0.9, offset: [0.6, 0] },
    },
    {
      id: "hall_art_right",
      type: "artFrames",
      position: [1.39, 0.85],
      rotation: -HALF,
      variant: 1,
      interaction: { label: "Pictures", verb: "Choose", radius: 0.9, offset: [-0.6, 0] },
    },
    { id: "hall_pendants", type: "pendants", position: [0, 0], rotation: 0, spots: [-3, 0, 3] },
    { id: "hall_plant", type: "decorPiece", item: "monstera", position: [-0.9, -3.95], rotation: 0, collider: { shape: "circle", radius: 0.38 } },
    { id: "hall_lamp", type: "decorPiece", item: "warm_lamp", position: [1.0, -4.05], rotation: 0, collider: { shape: "circle", radius: 0.24 } },
  ],
});
