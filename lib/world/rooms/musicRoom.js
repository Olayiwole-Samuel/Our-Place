/**
 * The music room, off the hallway: a record player you walk up to (it opens
 * Music), two big speakers, a little dance floor that lights up to the beat,
 * fairy lights, and somewhere to sit. Same shape of data as livingRoom.js.
 *
 *            BACK (z = -3.5): speaker · record player · speaker
 *                       dance floor
 *          bean bags                 loveseat
 *                 door to the hallway (z = +3.5)
 */
export const musicRoom = Object.freeze({
  id: "music_room",
  name: "Music room",
  size: { width: 7, depth: 7, height: 3.0 },
  bounds: { minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: 3.5 },
  spawnPoints: { 1: { x: 0, z: 2.4, ry: Math.PI }, 2: { x: 0, z: 2.4, ry: Math.PI } },
  lighting: "evening",
  window: null,
  shell: { wall: "#221a2e", wainscot: "#2f2440", floor: "#2a1f1a" },
  accentLight: [0, 2.6, -1],
  objects: [
    {
      id: "music_hall",
      type: "door",
      position: [0, 3.48],
      rotation: Math.PI,
      sign: "Hallway",
      interaction: { label: "Hallway", verb: "Go", radius: 1.1, offset: [0, -0.7] },
      destination: { room: "hallway", door: "hall_music" },
      arrive: { x: 0, z: 2.2, ry: Math.PI },
    },
    {
      id: "music_record_player",
      type: "recordPlayer",
      position: [0, -3.15],
      rotation: 0,
      scale: 1.15,
      collider: { shape: "box", halfWidth: 0.6, halfDepth: 0.3 },
      interaction: { label: "Music", verb: "Play", radius: 1.4, offset: [0, 0.9] },
    },
    { id: "speaker_left", type: "speaker", position: [-1.7, -3.1], rotation: 0.25, collider: { shape: "box", halfWidth: 0.3, halfDepth: 0.3 } },
    { id: "speaker_right", type: "speaker", position: [1.7, -3.1], rotation: -0.25, collider: { shape: "box", halfWidth: 0.3, halfDepth: 0.3 } },
    { id: "dance_floor", type: "danceFloor", position: [0, -0.9], rotation: 0 },
    { id: "music_lights", type: "musicLights", position: [0, 0], rotation: 0 },
    { id: "music_loveseat", type: "decorPiece", item: "loveseat", position: [2.3, 1.6], rotation: -2.2, collider: { shape: "box", halfWidth: 0.8, halfDepth: 0.43 } },
    { id: "music_bean_1", type: "decorPiece", item: "bean_bag", position: [-2.5, 1.2], rotation: 0.6, collider: { shape: "circle", radius: 0.4 } },
    { id: "music_bean_2", type: "decorPiece", item: "bean_bag", position: [-2.2, 2.4], rotation: 0.9, collider: { shape: "circle", radius: 0.4 } },
    { id: "music_plant", type: "decorPiece", item: "monstera", position: [-3.05, -3.0], rotation: 0, collider: { shape: "circle", radius: 0.38 } },
    { id: "music_lamp", type: "decorPiece", item: "warm_lamp", position: [3.1, -2.9], rotation: 0, collider: { shape: "circle", radius: 0.24 } },
    { id: "music_rug", type: "decorPiece", item: "round_rug", position: [2.0, 1.4], rotation: 0 },
  ],
});
