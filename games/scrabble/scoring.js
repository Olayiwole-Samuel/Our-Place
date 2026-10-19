import { BINGO_BONUS, CENTER, LETTER_VALUES, RACK_SIZE, SIZE, premiumAt } from "./board";

/**
 * Placement rules and scoring for the word board — pure, with no word list, so
 * the client can preview a play's points. The SERVER always re-runs this with
 * the real word list (rules.js → evaluatePlacement with isWord); a client
 * preview is never trusted.
 */
const key = (row, col) => `${row},${col}`;

/**
 * Checks a placement against the board and scores it — pure, shared with the
 * client for previews (without a word list, every word passes here). `board` maps "r,c" → { letter, blank }; `placed` is
 * [{ row, col, letter, blank }]. Returns { error } or { words: [{ word, score }], score, bingo }.
 */
export function evaluatePlacement(board, placed, { checkWord = () => true } = {}) {
  if (!placed.length) return { error: "Place at least one tile." };
  const seen = new Set();
  for (const tile of placed) {
    if (!Number.isInteger(tile.row) || !Number.isInteger(tile.col) || tile.row < 0 || tile.col < 0 || tile.row >= SIZE || tile.col >= SIZE) return { error: "That square is off the board." };
    if (board[key(tile.row, tile.col)]) return { error: "That square is already taken." };
    if (seen.has(key(tile.row, tile.col))) return { error: "Two tiles can't share a square." };
    seen.add(key(tile.row, tile.col));
  }
  const rows = new Set(placed.map((t) => t.row));
  const cols = new Set(placed.map((t) => t.col));
  if (rows.size > 1 && cols.size > 1) return { error: "Place your tiles in one row or one column." };
  const across = rows.size === 1 && (cols.size > 1 || hasNeighbour(board, placed[0], [0, 1]));
  const [dr, dc] = across ? [0, 1] : [1, 0];

  const at = (row, col) => {
    const fresh = placed.find((t) => t.row === row && t.col === col);
    return fresh ? { ...fresh, fresh: true } : board[key(row, col)] ? { ...board[key(row, col)], row, col, fresh: false } : null;
  };

  // No gaps between the first and last new tile (existing tiles may fill them).
  const sorted = [...placed].sort((a, b) => (across ? a.col - b.col : a.row - b.row));
  for (let r = sorted[0].row, c = sorted[0].col; r <= sorted.at(-1).row && c <= sorted.at(-1).col; r += dr, c += dc) {
    if (!at(r, c)) return { error: "Your tiles must form one connected word — no gaps." };
  }

  const firstMove = Object.keys(board).length === 0;
  if (firstMove) {
    if (!placed.some((t) => t.row === CENTER && t.col === CENTER)) return { error: "The first word must cover the centre star." };
    if (placed.length < 2) return { error: "The first word needs at least two letters." };
  } else if (!placed.some((t) => [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([r, c]) => board[key(t.row + r, t.col + c)]))) {
    return { error: "Your word must connect to the tiles already on the board." };
  }

  // Collects the word through (row, col) in direction (dr, dc).
  const wordThrough = (row, col, stepR, stepC) => {
    let r = row;
    let c = col;
    while (at(r - stepR, c - stepC)) {
      r -= stepR;
      c -= stepC;
    }
    const cells = [];
    while (at(r, c)) {
      cells.push(at(r, c));
      r += stepR;
      c += stepC;
    }
    return cells;
  };
  const scoreWord = (cells) => {
    let sum = 0;
    let multiplier = 1;
    for (const cell of cells) {
      let value = cell.blank ? 0 : LETTER_VALUES[cell.letter];
      if (cell.fresh) {
        const premium = premiumAt(cell.row, cell.col);
        if (premium === "DL") value *= 2;
        if (premium === "TL") value *= 3;
        if (premium === "DW") multiplier *= 2;
        if (premium === "TW") multiplier *= 3;
      }
      sum += value;
    }
    return sum * multiplier;
  };

  const words = [];
  const main = wordThrough(sorted[0].row, sorted[0].col, dr, dc);
  if (main.length >= 2) words.push(main);
  for (const tile of placed) {
    const cross = wordThrough(tile.row, tile.col, dc, dr);
    if (cross.length >= 2) words.push(cross);
  }
  if (!words.length) return { error: "A word needs at least two letters." };

  const formed = words.map((cells) => ({ word: cells.map((cell) => cell.letter).join(""), score: scoreWord(cells) }));
  const invalid = formed.filter(({ word }) => !checkWord(word));
  if (invalid.length) return { error: `${invalid.map(({ word }) => word).join(", ")} ${invalid.length === 1 ? "isn't" : "aren't"} in the word list.`, invalid: invalid.map(({ word }) => word) };
  const bingo = placed.length === RACK_SIZE;
  return { words: formed, score: formed.reduce((sum, w) => sum + w.score, 0) + (bingo ? BINGO_BONUS : 0), bingo };
}

function hasNeighbour(board, tile, [dr, dc]) {
  return Boolean(board[key(tile.row + dr, tile.col + dc)] || board[key(tile.row - dr, tile.col - dc)]);
}

