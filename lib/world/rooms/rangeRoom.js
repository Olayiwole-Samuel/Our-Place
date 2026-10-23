/**
 * The range: an indoor shooting range. Two lanes side by side behind a
 * counter (one each — shoot together or take turns); targets pop up
 * downrange. Walk up to a lane and press Shoot to take aim (lib/range/*,
 * components/3d/Range/*). The board by the door shows your best scores.
 *
 *            BACK (z = -6): berm and targets
 *                 lane 1 | lane 2
 *            ────────── counter ──────────  (z = 1.5)
 *                  you stand here
 *    best scores        door to the hallway (z = +6)
 */
export const RANGE_COUNTER_Z = 1.5;

export const rangeRoom = Object.freeze({
  id: "range_room",
  name: "Range",
  size: { width: 6, depth: 12, height: 3.2 },
  bounds: { minX: -3, maxX: 3, minZ: -6, maxZ: 6 },
  spawnPoints: { 1: { x: 0, z: 5.2, ry: Math.PI }, 2: { x: 0, z: 5.2, ry: Math.PI } },
  lighting: "evening",
  window: null,
  shell: { wall: "#383b40", wainscot: "#2b2e33", floor: "#26282b" },
  accentLight: [0, 2.8, -4],
  objects: [
    {
      id: "range_hall",
      type: "door",
      position: [1.6, 5.98],
      rotation: Math.PI,
      sign: "Hallway",
      interaction: { label: "Hallway", verb: "Go", radius: 1.1, offset: [0, -0.7] },
      destination: { room: "hallway", door: "hall_range" },
      arrive: { x: 1.6, z: 4.2, ry: Math.PI }, // a step in, so the camera has room behind you
    },
    // The counter across the room: you shoot from behind it.
    { id: "range_counter", type: "rangeCounter", position: [0, RANGE_COUNTER_Z], rotation: 0, collider: { shape: "box", halfWidth: 3, halfDepth: 0.3 } },
    {
      id: "lane_1",
      type: "rangeLane",
      position: [-1.25, RANGE_COUNTER_Z],
      rotation: 0,
      lane: 0,
      interaction: { label: "Lane 1", verb: "Shoot", radius: 1.0, offset: [0, 0.75] },
    },
    {
      id: "lane_2",
      type: "rangeLane",
      position: [1.25, RANGE_COUNTER_Z],
      rotation: 0,
      lane: 1,
      interaction: { label: "Lane 2", verb: "Shoot", radius: 1.0, offset: [0, 0.75] },
    },
    { id: "range_downrange", type: "rangeDownrange", position: [0, 0], rotation: 0 },
    { id: "range_board", type: "rangeBoard", position: [-2.98, 4.2], rotation: Math.PI / 2 },
  ],
});
