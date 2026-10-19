/**
 * Jigsaw geometry — shared by the rules (server) and the client (drawing).
 * Units: one piece is 1×1; the finished picture (the frame) spans
 * [0, cols] × [0, rows]. Loose pieces live on a table around it.
 *
 * Every inner edge gets a tab (+1 = the tab sticks out of the piece on the
 * left/top, −1 = into it), drawn by the server, so both players see exactly the
 * same pieces. Two neighbours always fit: one has the tab, the other the hole.
 */
export const DIFFICULTIES = Object.freeze({
  easy: { cols: 4, rows: 3, label: "Easy · 12 pieces" },
  medium: { cols: 6, rows: 4, label: "Medium · 24 pieces" },
  hard: { cols: 8, rows: 6, label: "Hard · 48 pieces" },
});

/** Table around the frame (in piece units) where loose pieces are scattered. */
export const TABLE_MARGIN = Object.freeze({ x: 2.8, y: 0.6 }); // wide rather than tall: screens (and phones held sideways) are

export function tableBounds({ cols, rows }) {
  return { minX: -TABLE_MARGIN.x, maxX: cols + TABLE_MARGIN.x - 1, minY: -TABLE_MARGIN.y, maxY: rows + TABLE_MARGIN.y - 1 };
}

/** Random tabs for every inner edge: h[row][col] below piece (col,row); v[row][col] right of it. */
export function drawEdges({ cols, rows }, random) {
  const sign = () => (random.int(0, 1) ? 1 : -1);
  return {
    h: Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, sign)),
    v: Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, sign)),
  };
}

/** Outward tab direction of each side of piece (col,row): 1 out, −1 in, 0 flat. */
export function pieceSides(edges, { cols, rows }, col, row) {
  return {
    top: row === 0 ? 0 : -edges.h[row - 1][col],
    bottom: row === rows - 1 ? 0 : edges.h[row][col],
    left: col === 0 ? 0 : -edges.v[row][col - 1],
    right: col === cols - 1 ? 0 : edges.v[row][col],
  };
}

// One side as (u along the edge, v outward) control points: neck, round head, neck.
const TAB = [
  ["L", [0.34, 0]],
  ["C", [0.4, 0], [0.4, 0.1], [0.38, 0.14]],
  ["C", [0.34, 0.22], [0.4, 0.3], [0.5, 0.3]],
  ["C", [0.6, 0.3], [0.66, 0.22], [0.62, 0.14]],
  ["C", [0.6, 0.1], [0.6, 0], [0.66, 0]],
  ["L", [1, 0]],
];

const SIDE_MAPS = {
  top: (u, v) => [u, -v],
  right: (u, v) => [1 + v, u],
  bottom: (u, v) => [1 - u, 1 + v],
  left: (u, v) => [-v, 1 - u],
};

const fmt = (n) => Number(n.toFixed(3));

/** SVG path of a piece in its own units (the 1×1 square plus tabs), starting at its top-left corner. */
export function piecePath(sides) {
  let d = "M0 0";
  for (const side of ["top", "right", "bottom", "left"]) {
    const map = SIDE_MAPS[side];
    const s = sides[side];
    if (!s) {
      const [x, y] = map(1, 0);
      d += ` L${fmt(x)} ${fmt(y)}`;
      continue;
    }
    for (const [command, ...points] of TAB) {
      d += ` ${command}${points.map(([u, v]) => map(u, v * s).map(fmt).join(" ")).join(" ")}`;
    }
  }
  return `${d} Z`;
}
