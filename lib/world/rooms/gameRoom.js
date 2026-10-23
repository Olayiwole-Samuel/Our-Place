/**
 * The game room: a cosy arcade for the two of you. A big screen on the back
 * wall opens the games menu, arcade cabinets and a game table open their
 * kinds of games, bean bags and a loveseat face the screen, neon glows along
 * the walls, and a scoreboard shows who's winning (your head-to-head record).
 *
 *            BACK (z = -3.7): the big screen
 *    arcade            rug + bean bags            scoreboard
 *    arcade              loveseat        game table
 *                                       door to the hallway (z = +3.7)
 */
const HALF = Math.PI / 2;

export const gameRoom = Object.freeze({
  id: "game_room",
  name: "Game room",
  size: { width: 8, depth: 7.4, height: 3.1 },
  bounds: { minX: -4, maxX: 4, minZ: -3.7, maxZ: 3.7 },
  spawnPoints: { 1: { x: 2.8, z: 2.9, ry: Math.PI }, 2: { x: 2.8, z: 2.9, ry: Math.PI } },
  lighting: "evening",
  window: null,
  shell: { wall: "#1b1730", wainscot: "#251f40", floor: "#17161d" },
  accentLight: [0, 2.6, -3],
  objects: [
    {
      id: "game_hall",
      type: "door",
      position: [2.8, 3.68],
      rotation: Math.PI,
      sign: "Hallway",
      interaction: { label: "Hallway", verb: "Go", radius: 1.1, offset: [0, -0.7] },
      destination: { room: "hallway", door: "hall_game" },
      arrive: { x: 2.6, z: 2.0, ry: Math.PI }, // a step in, so the camera has room behind you
    },
    {
      id: "big_screen",
      type: "gameScreen",
      position: [0, -3.68],
      rotation: 0,
      interaction: { label: "Games", verb: "Play", radius: 1.9, offset: [0, 1.7] },
    },
    {
      id: "arcade_1",
      type: "arcade",
      position: [-3.62, -1.7],
      rotation: HALF,
      category: "quick_casual",
      variant: 0,
      collider: { shape: "box", halfWidth: 0.36, halfDepth: 0.36 },
      interaction: { label: "Arcade", verb: "Play", radius: 1.1, offset: [0.85, 0] },
    },
    {
      id: "arcade_2",
      type: "arcade",
      position: [-3.62, -0.6],
      rotation: HALF,
      category: "word_games",
      variant: 1,
      collider: { shape: "box", halfWidth: 0.36, halfDepth: 0.36 },
      interaction: { label: "Word arcade", verb: "Play", radius: 1.0, offset: [0.85, 0] },
    },
    {
      id: "game_table",
      type: "gameTable",
      position: [2.0, 0.2],
      rotation: 0,
      category: "board_strategy",
      collider: { shape: "box", halfWidth: 0.65, halfDepth: 0.75 },
      interaction: { label: "Board games", verb: "Play", radius: 1.4, offset: [-1.05, 0] },
    },
    { id: "game_rug", type: "decorPiece", item: "round_rug", position: [-0.6, -1.4], rotation: 0 },
    { id: "bean_1", type: "decorPiece", item: "bean_bag", position: [-1.3, -1.6], rotation: 0.3, collider: { shape: "circle", radius: 0.4 } },
    { id: "bean_2", type: "decorPiece", item: "bean_bag", position: [0.1, -1.7], rotation: -0.2, collider: { shape: "circle", radius: 0.4 } },
    { id: "game_loveseat", type: "decorPiece", item: "loveseat", position: [-0.6, 0.4], rotation: Math.PI, collider: { shape: "box", halfWidth: 0.8, halfDepth: 0.43 } },
    { id: "scoreboard", type: "scoreboard", position: [3.98, -1.4], rotation: -HALF },
    { id: "neon", type: "neon", position: [0, 0], rotation: 0 },
    { id: "game_plant", type: "decorPiece", item: "monstera", position: [-3.5, 3.2], rotation: 0, collider: { shape: "circle", radius: 0.38 } },
  ],
});
