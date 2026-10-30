import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Reversi / Othello — 8×8, four discs in the middle to start. Place a disc so
 * it traps a straight line (any of 8 directions) of your partner's discs
 * between it and one of yours; every trapped disc flips to your colour. A move
 * must flip at least one disc. No move? Your turn passes. When neither of you
 * can move, the one with more discs wins (equal is a draw). Pure rules run by
 * the server; clients send { type: "place", payload: { square } } (0–63) or
 * { type: "resign" }.
 *
 * State: { board: ("b"|"w"|null)[64], sides: { [playerId]: "b"|"w" }, turn: "b"|"w",
 *          last: { square, flipped, by } | null, passed: playerId | null, over, resigned }
 * Black moves first; the server draws who's Black.
 */
export const SIZE = 8;
const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const other = (side) => (side === "b" ? "w" : "b");

/** The discs a disc of `side` on `square` would flip (empty = not a legal move). */
export function flipsFor(board, square, side) {
  if (board[square]) return [];
  const row = Math.floor(square / SIZE);
  const col = square % SIZE;
  const flips = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === other(side)) {
      line.push(r * SIZE + c);
      r += dr;
      c += dc;
    }
    if (line.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === side) flips.push(...line);
  }
  return flips;
}

export function legalSquares(board, side) {
  const list = [];
  for (let square = 0; square < SIZE * SIZE; square++) if (flipsFor(board, square, side).length) list.push(square);
  return list;
}

export const countOf = (board, side) => board.filter((d) => d === side).length;
const playerOf = (state, side) => Object.keys(state.sides).find((id) => state.sides[id] === side);

const rules = {
  setup({ playerIds, random }) {
    const black = playerIds[random.int(0, playerIds.length - 1)];
    const board = Array(SIZE * SIZE).fill(null);
    board[27] = board[36] = "w";
    board[28] = board[35] = "b";
    return { board, sides: Object.fromEntries(playerIds.map((id) => [id, id === black ? "b" : "w"])), turn: "b", last: null, passed: null, over: false, resigned: null, moves: 0 };
  },

  validate(state, action) {
    if (state.over) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (action.type === "resign") return null;
    if (action.type !== "place") return gameError(GAME_ERROR.MALFORMED_ACTION, "That move wasn't understood.");
    const square = action.payload?.square;
    if (!Number.isInteger(square) || square < 0 || square >= SIZE * SIZE) return gameError(GAME_ERROR.MALFORMED_ACTION, "That square doesn't exist.");
    if (state.sides[action.playerId] !== state.turn) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    if (!flipsFor(state.board, square, state.turn).length) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That square doesn't trap any discs.");
    return null;
  },

  apply(state, action) {
    if (action.type === "resign") return { ...state, over: true, resigned: action.playerId };
    const side = state.turn;
    const { square } = action.payload;
    const flipped = flipsFor(state.board, square, side);
    const board = [...state.board];
    board[square] = side;
    for (const s of flipped) board[s] = side;
    const next = { ...state, board, last: { square, flipped, by: action.playerId }, moves: state.moves + 1, passed: null };
    if (legalSquares(board, other(side)).length) return { ...next, turn: other(side) };
    if (legalSquares(board, side).length) return { ...next, turn: side, passed: playerOf(state, other(side)) }; // they can't move: you go again
    return { ...next, over: true };
  },

  getResult(state) {
    if (!state.over) return null;
    const scores = Object.fromEntries(Object.entries(state.sides).map(([id, side]) => [id, countOf(state.board, side)]));
    if (state.resigned) return { outcome: "win", winnerId: Object.keys(state.sides).find((id) => id !== state.resigned), scores, summary: { resigned: state.resigned } };
    const [a, b] = Object.keys(scores);
    if (scores[a] === scores[b]) return { outcome: "draw", scores };
    return { outcome: "win", winnerId: scores[a] > scores[b] ? a : b, scores };
  },

  view(state, playerId) {
    const mine = state.sides[playerId] === state.turn && !state.over;
    return {
      board: state.board,
      sides: state.sides,
      mySide: state.sides[playerId],
      turn: playerOf(state, state.turn),
      legal: mine ? legalSquares(state.board, state.turn) : [],
      last: state.last,
      passed: state.passed,
      counts: { b: countOf(state.board, "b"), w: countOf(state.board, "w") },
      moves: state.moves,
      ended: state.over,
    };
  },
};

export default rules;
