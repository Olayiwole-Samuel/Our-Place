import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Checkers (English draughts) — 8×8, pieces on the dark squares, 12 each.
 * Pure rules run by the server; clients send intents only:
 *   move { from, to }   one step or one jump (squares 0–63, row 0 at the top)
 *   resign {}
 *
 *   • Dark ("b", bottom at the start) moves first; the server picks who's dark.
 *   • Men move one square diagonally forward; kings forward or back.
 *   • Jumping is compulsory: if you can capture, you must. After a jump, if the
 *     same piece can jump again it must carry on (state.chain) — same turn.
 *   • A man reaching the far row is crowned king, and that ends the turn.
 *   • You win when your partner has no pieces or no legal move left.
 *   • 40 moves each with no capture and no crowning is a draw.
 *
 * State: { board: ({ c: "b"|"w", k: bool } | null)[64], sides: { [playerId]: "b"|"w" },
 *          turn: "b"|"w", chain: square | null, quiet, last, winner, resigned }
 */
export const SIZE = 8;
const QUIET_LIMIT = 80; // plies with no capture or crowning → draw

const rowOf = (square) => Math.floor(square / SIZE);
const colOf = (square) => square % SIZE;
const inside = (row, col) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;
export const isDark = (square) => (rowOf(square) + colOf(square)) % 2 === 1;
const forward = (side) => (side === "b" ? -1 : 1);
const other = (side) => (side === "b" ? "w" : "b");

function directions(piece) {
  const dirs = piece.k ? [-1, 1] : [forward(piece.c)];
  return dirs.flatMap((dr) => [
    [dr, -1],
    [dr, 1],
  ]);
}

/** Jumps from one square: [{ to, over }]. */
function jumpsFrom(board, square) {
  const piece = board[square];
  if (!piece) return [];
  const list = [];
  for (const [dr, dc] of directions(piece)) {
    const r = rowOf(square) + dr;
    const c = colOf(square) + dc;
    const r2 = r + dr;
    const c2 = c + dc;
    if (!inside(r2, c2)) continue;
    const middle = board[r * SIZE + c];
    if (middle && middle.c !== piece.c && !board[r2 * SIZE + c2]) list.push({ to: r2 * SIZE + c2, over: r * SIZE + c });
  }
  return list;
}

function stepsFrom(board, square) {
  const piece = board[square];
  if (!piece) return [];
  const list = [];
  for (const [dr, dc] of directions(piece)) {
    const r = rowOf(square) + dr;
    const c = colOf(square) + dc;
    if (inside(r, c) && !board[r * SIZE + c]) list.push(r * SIZE + c);
  }
  return list;
}

/**
 * Every legal move for `side`: { [from]: [to, …] }, and whether they're jumps.
 * With a chain in progress, only that piece's further jumps.
 */
export function legalMoves(state, side = state.turn) {
  const targets = {};
  if (state.chain !== null && state.chain !== undefined) {
    const jumps = jumpsFrom(state.board, state.chain);
    if (jumps.length) targets[state.chain] = jumps.map((j) => j.to);
    return { targets, jumping: true };
  }
  let jumping = false;
  for (let square = 0; square < SIZE * SIZE; square++) {
    if (state.board[square]?.c !== side) continue;
    const jumps = jumpsFrom(state.board, square);
    if (jumps.length) {
      if (!jumping) for (const key of Object.keys(targets)) delete targets[key];
      jumping = true;
      targets[square] = jumps.map((j) => j.to);
    } else if (!jumping) {
      const steps = stepsFrom(state.board, square);
      if (steps.length) targets[square] = steps;
    }
  }
  return { targets, jumping };
}

const hasMoves = (state, side) => Object.keys(legalMoves({ ...state, chain: null }, side).targets).length > 0;
const playerOf = (state, side) => Object.keys(state.sides).find((id) => state.sides[id] === side);
export const countPieces = (board, side) => board.filter((p) => p?.c === side).length;

const rules = {
  setup({ playerIds, random }) {
    const dark = playerIds[random.int(0, playerIds.length - 1)];
    const board = Array(SIZE * SIZE).fill(null);
    for (let square = 0; square < SIZE * SIZE; square++) {
      if (!isDark(square)) continue;
      if (rowOf(square) < 3) board[square] = { c: "w", k: false };
      else if (rowOf(square) > 4) board[square] = { c: "b", k: false };
    }
    return {
      board,
      sides: Object.fromEntries(playerIds.map((id) => [id, id === dark ? "b" : "w"])),
      turn: "b",
      chain: null,
      quiet: 0,
      moves: 0,
      last: null,
      winner: null,
      resigned: null,
      drawn: false,
    };
  },

  validate(state, action) {
    if (state.winner || state.drawn) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    const side = state.sides[action.playerId];
    if (action.type === "resign") return null;
    if (action.type !== "move") return gameError(GAME_ERROR.MALFORMED_ACTION, "That move wasn't understood.");
    const { from, to } = action.payload ?? {};
    if (![from, to].every((s) => Number.isInteger(s) && s >= 0 && s < SIZE * SIZE)) return gameError(GAME_ERROR.MALFORMED_ACTION, "That square doesn't exist.");
    if (side !== state.turn) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    const { targets, jumping } = legalMoves(state);
    if (!(targets[from] ?? []).includes(to)) {
      if (state.chain !== null) return gameError(GAME_ERROR.ILLEGAL_ACTION, "Keep jumping with the same piece.");
      if (jumping) return gameError(GAME_ERROR.ILLEGAL_ACTION, "You must jump when you can.");
      return gameError(GAME_ERROR.ILLEGAL_ACTION, "That piece can't go there.");
    }
    return null;
  },

  apply(state, action) {
    const side = state.sides[action.playerId];
    if (action.type === "resign") return { ...state, winner: playerOf(state, other(side)), resigned: action.playerId };

    const { from, to } = action.payload;
    const board = [...state.board];
    const piece = board[from];
    board[from] = null;
    const jump = Math.abs(rowOf(to) - rowOf(from)) === 2;
    let captured = null;
    if (jump) {
      captured = ((rowOf(from) + rowOf(to)) / 2) * SIZE + (colOf(from) + colOf(to)) / 2;
      board[captured] = null;
    }
    const crowned = !piece.k && rowOf(to) === (piece.c === "b" ? 0 : SIZE - 1);
    board[to] = crowned ? { ...piece, k: true } : piece;

    const last = { from, to, captured, crowned, by: action.playerId };
    const quiet = jump || crowned ? 0 : state.quiet + 1;
    // Another jump with the same piece (not after being crowned) keeps the turn.
    if (jump && !crowned && jumpsFrom(board, to).length) {
      return { ...state, board, chain: to, quiet, last };
    }
    const next = { ...state, board, chain: null, quiet, last, moves: state.moves + 1, turn: other(side) };
    if (!hasMoves(next, other(side))) return { ...next, winner: action.playerId };
    if (quiet >= QUIET_LIMIT) return { ...next, drawn: true };
    return next;
  },

  getResult(state) {
    const scores = Object.fromEntries(Object.entries(state.sides).map(([id, side]) => [id, 12 - countPieces(state.board, other(side))]));
    if (state.winner) return { outcome: "win", winnerId: state.winner, scores, summary: { resigned: state.resigned } };
    if (state.drawn) return { outcome: "draw", scores };
    return null;
  },

  view(state, playerId) {
    const { targets, jumping } = legalMoves(state);
    return {
      board: state.board,
      sides: state.sides,
      mySide: state.sides[playerId],
      turn: playerOf(state, state.turn),
      chain: state.chain,
      legal: state.sides[playerId] === state.turn ? targets : {},
      mustJump: jumping,
      last: state.last,
      quiet: state.quiet,
      moves: state.moves,
      pieces: { b: countPieces(state.board, "b"), w: countPieces(state.board, "w") },
      ended: Boolean(state.winner || state.drawn),
    };
  },
};

export default rules;
