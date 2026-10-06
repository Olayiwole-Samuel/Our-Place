/**
 * Naija Ludo — the logical board (two players). Pure data and functions shared
 * by the rules (server) and the board renderer (client). No pixels here: the
 * client maps logical positions to the screen (layout.js).
 *
 * Track: one shared loop of 52 squares, numbered from seat A's start tile.
 * Seat A starts on square 0, seat B on square 26 (opposite corners).
 *
 * A piece's position is its PROGRESS along its own path:
 *   -1         yard (not on the board yet)
 *   0 … 50     shared track (absolute square = (start + progress) % 52)
 *   51 … 55    the seat's private home lane (5 squares)
 *   56         home — reached by exact count only
 */
export const TRACK_LENGTH = 52;
export const YARD = -1;
export const LAST_TRACK = 50;
export const LANE_START = 51;
export const HOME = 56;
export const PIECES_PER_PLAYER = 4;

/** Seat 0 / seat 1. Letters name the pieces (A1…A4, B1…B4). */
export const SEATS = Object.freeze([
  Object.freeze({ letter: "A", start: 0 }),
  Object.freeze({ letter: "B", start: 26 }),
]);
export const START_SQUARES = Object.freeze(SEATS.map((seat) => seat.start));

/**
 * Safe squares (absolute): the four start tiles of a full board and the four
 * star squares. A lone piece on one can't be killed.
 */
export const SAFE_SQUARES = Object.freeze([0, 8, 13, 21, 26, 34, 39, 47]);
const SAFE = new Set(SAFE_SQUARES);

export const pieceIds = (seat) => Array.from({ length: PIECES_PER_PLAYER }, (_, i) => `${SEATS[seat].letter}${i + 1}`);
export const seatOfPiece = (pieceId) => SEATS.findIndex((seat) => seat.letter === pieceId?.[0]);
export const isPieceId = (value) => typeof value === "string" && /^[AB][1-4]$/.test(value);

/** "yard" | "track" | "lane" | "home" */
export function zoneOf(progress) {
  if (progress === YARD) return "yard";
  if (progress >= HOME) return "home";
  if (progress >= LANE_START) return "lane";
  return "track";
}

/** Absolute track square (0–51) of a piece on the shared track, otherwise null. */
export function squareOf(seat, progress) {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (SEATS[seat].start + progress) % TRACK_LENGTH;
}

export const isSafeSquare = (square) => SAFE.has(square);
