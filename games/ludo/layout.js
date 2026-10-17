import { HOME, LANE_START, TRACK_LENGTH, YARD, squareOf } from "./board";

/**
 * Logical positions → board coordinates (client only). The board is a 15×15
 * grid; coordinates are continuous [row, col] in grid units (a cell's centre is
 * r + 0.5, c + 0.5), so the renderer can place things at percentages.
 *
 * Canonical orientation: seat A's yard bottom-left, seat B's top-right. Each
 * player sees their own yard at the bottom-left (the board turned 180° for
 * seat B), like sitting across a real board — the logical board is identical.
 */
export const GRID = 15;

// The 52-square loop, starting on seat A's start square and running clockwise.
const TRACK = (() => {
  const cells = [];
  const run = (r, c, dr, dc, n) => {
    for (let i = 0; i < n; i += 1) cells.push([r + dr * i, c + dc * i]);
  };
  // Built for a top-left start, then turned a quarter (top-left → bottom-left).
  run(6, 1, 0, 1, 5);
  run(5, 6, -1, 0, 6);
  cells.push([0, 7]);
  run(0, 8, 1, 0, 6);
  run(6, 9, 0, 1, 6);
  cells.push([7, 14]);
  run(8, 14, 0, -1, 6);
  run(9, 8, 1, 0, 6);
  cells.push([14, 7]);
  run(14, 6, -1, 0, 6);
  run(8, 5, 0, -1, 6);
  cells.push([7, 0], [6, 0]);
  return cells.map(([r, c]) => [14 - c, r]);
})();
if (TRACK.length !== TRACK_LENGTH) throw new Error("Ludo track must have 52 squares");

const LANES = [
  [13, 12, 11, 10, 9].map((r) => [r, 7]), // seat A, upwards from the bottom
  [1, 2, 3, 4, 5].map((r) => [r, 7]), // seat B, downwards from the top
];
const YARD_SLOTS = [
  [
    [10.9, 1.9],
    [10.9, 4.1],
    [13.1, 1.9],
    [13.1, 4.1],
  ],
  [
    [1.9, 10.9],
    [1.9, 13.1],
    [4.1, 10.9],
    [4.1, 13.1],
  ],
];
const HOME_SLOTS = [
  [8.45, 6.85, 7.25, 7.65, 8.05], // row, then four columns — inside A's home triangle
  [6.55, 8.15, 7.75, 7.35, 6.95],
];

const center = ([r, c]) => [r + 0.5, c + 0.5];

/** Turns canonical coordinates into the viewer's (seat B sees the board turned 180°). */
export const orient = ([r, c], viewerSeat) => (viewerSeat === 1 ? [GRID - r, GRID - c] : [r, c]);

/** Canonical coordinates of a piece. `index` is 0–3 (its number − 1). */
export function piecePoint(seat, progress, index) {
  if (progress === YARD) return YARD_SLOTS[seat][index];
  if (progress >= HOME) {
    const [row, ...cols] = HOME_SLOTS[seat];
    return [row, cols[index]];
  }
  if (progress >= LANE_START) return center(LANES[seat][progress - LANE_START]);
  return center(TRACK[squareOf(seat, progress)]);
}

/** Static board cells for the renderer: [{ r, c, kind, seat? }] in canonical orientation. */
export const BOARD_CELLS = (() => {
  const cells = TRACK.map(([r, c], square) => {
    const startOf = square === 0 ? 0 : square === 26 ? 1 : null;
    return { r, c, kind: startOf !== null ? "start" : "track", seat: startOf ?? undefined };
  });
  LANES.forEach((lane, seat) => lane.forEach(([r, c]) => cells.push({ r, c, kind: "lane", seat })));
  return cells;
})();
