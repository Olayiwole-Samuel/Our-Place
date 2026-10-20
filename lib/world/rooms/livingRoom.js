/**
 * The couple's living room, as data.
 *
 * The 3D scene is rendered FROM this configuration (components/3d/World/Room.jsx
 * maps each object's `type` to a component), so later phases can change the
 * room — unlock decorations, grow the plant, move furniture, switch lighting —
 * by producing a different config, without rewriting the scene. When room
 * customisation is persisted (room-evolution phase), a stored per-couple config
 * is merged over this default.
 *
 * Units are metres. Y is up. The back wall is at z = minZ (the camera starts
 * looking toward it). Rotation is yaw in radians; every object's front faces its
 * local +z, so rotation π faces the back wall, π/2 faces +x, −π/2 faces −x.
 * Collider half-sizes are in WORLD axes (already accounting for rotation).
 * `occluder` marks tall props that fade out when they block the camera's view of the player.
 *
 *          BACK WALL (z = -4)
 *    plant  photo wall      video screen
 *                  coffee table
 *                 [   couch   ]      game corner (right wall)
 *    message          rug
 *    board        spawn A · spawn B
 *    bookshelf                          door (right wall)
 *          FRONT (z = +4)
 */
export const PLAYER_RADIUS = 0.28;

export const livingRoom = Object.freeze({
  id: "living_room",
  name: "Living room",

  size: { width: 9, depth: 8, height: 3.1 },
  bounds: { minX: -4.5, maxX: 4.5, minZ: -4, maxZ: 4 },

  // Slot 1 = the inviter, slot 2 = the partner who joined. Side by side, facing the room.
  spawnPoints: {
    1: { x: -0.75, z: 1.15, ry: Math.PI },
    2: { x: 0.75, z: 1.15, ry: Math.PI },
  },

  // `verb` names what interacting does. Only real actions get their own verb (Sit);
  // objects whose feature arrives later use "Look", which opens an honest info card.

  // Evolvable state. Later phases derive these from streaks, wins, photos…
  plantStage: 0,
  lighting: "auto", // "auto" = by local time, or a TIME_OF_DAY id

  objects: [
    {
      id: "couch",
      type: "couch",
      position: [0, -0.8],
      rotation: Math.PI,
      collider: { shape: "box", halfWidth: 1.15, halfDepth: 0.48 },
      interaction: { label: "Couch", verb: "Sit", radius: 1.2, offset: [0, 0.75] },
      // Seats face the screen (−z). Each partner has their own spot.
      seats: { 1: { x: -0.5, z: -0.92, ry: Math.PI }, 2: { x: 0.5, z: -0.92, ry: Math.PI } },
    },
    { id: "rug", type: "rug", position: [0, -1.7], rotation: 0 },
    {
      id: "coffee_table",
      type: "coffeeTable",
      position: [0, -2.3],
      rotation: 0,
      collider: { shape: "box", halfWidth: 0.6, halfDepth: 0.32 },
    },
    {
      id: "plant",
      type: "plant",
      position: [-3.85, -3.45],
      rotation: 0,
      collider: { shape: "circle", radius: 0.38 },
      occluder: { radius: 0.55 },
      interaction: { label: "Plant", verb: "Look", radius: 1.25, offset: [0.6, 0.6] },
    },
    {
      id: "photo_wall",
      type: "photoWall",
      position: [-1.9, -3.98],
      rotation: 0,
      interaction: { label: "Memories", verb: "Open", radius: 1.5, offset: [0, 1.1] },
    },
    {
      id: "video_screen",
      type: "videoScreen",
      position: [2.2, -3.98],
      rotation: 0,
      interaction: { label: "TV", verb: "Watch", radius: 1.7, offset: [0, 1.3] },
    },
    {
      id: "media_console",
      type: "mediaConsole",
      position: [2.2, -3.78],
      rotation: 0,
      collider: { shape: "box", halfWidth: 0.95, halfDepth: 0.22 },
    },
    {
      id: "bookshelf",
      type: "bookshelf",
      position: [-4.3, 1.5],
      rotation: Math.PI / 2,
      collider: { shape: "box", halfWidth: 0.2, halfDepth: 0.75 },
      occluder: { radius: 0.85 },
      interaction: { label: "Trophies", verb: "Open", radius: 1.3, offset: [0.75, 0] },
    },
    {
      id: "message_board",
      type: "messageBoard",
      position: [-4.48, -1.2],
      rotation: Math.PI / 2,
      interaction: { label: "Notes", verb: "Open", radius: 1.25, offset: [0.75, 0] },
    },
    {
      id: "game_corner",
      type: "gameCorner",
      position: [4.2, -0.6],
      rotation: -Math.PI / 2,
      collider: { shape: "box", halfWidth: 0.3, halfDepth: 0.65 },
      occluder: { radius: 0.75 },
      interaction: { label: "Games", verb: "Play", radius: 1.4, offset: [-0.8, 0] },
    },
    {
      id: "door",
      type: "door",
      position: [4.48, 2.6],
      rotation: -Math.PI / 2,
      interaction: { label: "Door", verb: "Look", radius: 1.2, offset: [-0.7, 0] },
      // Future world transitions (Range Room, game rooms, watch room…) attach here.
      destination: null,
    },
    {
      id: "floor_lamp",
      type: "floorLamp",
      position: [-2.1, -1.0],
      rotation: 0,
      collider: { shape: "circle", radius: 0.2 },
      occluder: { radius: 0.45 },
    },
  ],
});

/** Colliders in world space, derived from the objects. */
export function roomColliders(room) {
  return room.objects
    .filter((object) => object.collider)
    .map(({ collider, position: [x, z] }) => ({ ...collider, x, z }));
}

/** Interactables in world space (interaction point = position + offset). */
export function roomInteractables(room) {
  return room.objects
    .filter((object) => object.interaction)
    .map(({ id, type, interaction: { label, verb, radius, offset = [0, 0] }, position: [x, z] }) => ({
      id,
      type,
      label,
      verb,
      radius,
      x: x + offset[0],
      z: z + offset[1],
    }));
}
