/**
 * The word board — shared by the rules (server) and the client (drawing).
 * Standard 15×15 layout, standard English tile set (100 tiles) and letter values.
 *
 * Premium squares: TW triple word · DW double word (the centre star is a DW) ·
 * TL triple letter · DL double letter. A premium counts only on the turn a tile
 * is first placed on it.
 */
export const SIZE = 15;
export const CENTER = 7;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;

export const LETTER_VALUES = Object.freeze({
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
});

/** How many of each tile the bag holds ("?" = blank). 100 in total. */
export const DISTRIBUTION = Object.freeze({
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, "?": 2,
});

/** Every tile as { id, letter } — letter "?" is a blank. Ids are stable ("E-3"). */
export function allTiles() {
  return Object.entries(DISTRIBUTION).flatMap(([letter, count]) => Array.from({ length: count }, (_, i) => ({ id: `${letter === "?" ? "blank" : letter}-${i + 1}`, letter })));
}

const TW = [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]];
const DW = [[1, 1], [2, 2], [3, 3], [4, 4], [1, 13], [2, 12], [3, 11], [4, 10], [13, 1], [12, 2], [11, 3], [10, 4], [13, 13], [12, 12], [11, 11], [10, 10], [7, 7]];
const TL = [[1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13], [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]];
const DL = [
  [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11],
  [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11],
];

const PREMIUMS = new Map([...TW.map(([r, c]) => [`${r},${c}`, "TW"]), ...DW.map(([r, c]) => [`${r},${c}`, "DW"]), ...TL.map(([r, c]) => [`${r},${c}`, "TL"]), ...DL.map(([r, c]) => [`${r},${c}`, "DL"])]);

/** "TW" | "DW" | "TL" | "DL" | null for a square. */
export function premiumAt(row, col) {
  return PREMIUMS.get(`${row},${col}`) ?? null;
}

export const PREMIUM_LABEL = Object.freeze({ TW: "Triple word", DW: "Double word", TL: "Triple letter", DL: "Double letter" });
