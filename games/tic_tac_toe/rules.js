import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { advanceTurn, createTurnOrder, currentPlayer, requireTurn } from "@/lib/game/turns";

/**
 * Tic Tac Toe — the small, complete game used to validate the platform end to
 * end (turn-based, server-authoritative, win/draw results). Pure rules: the
 * server runs these; clients only send { type: "place", payload: { cell } }.
 *
 * State: { cells: (playerId|null)[9], marks: { [playerId]: "X"|"O" }, turn, line }
 * The first player (X) is chosen by the server's seeded random, not a client.
 */
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function winningLine(cells) {
  return LINES.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) ?? null;
}

const rules = {
  setup({ playerIds, random }) {
    const first = random.int(0, playerIds.length - 1);
    const turn = createTurnOrder(playerIds, first);
    const xPlayer = currentPlayer(turn);
    const marks = Object.fromEntries(playerIds.map((id) => [id, id === xPlayer ? "X" : "O"]));
    return { cells: Array(9).fill(null), marks, turn, line: null };
  },

  validate(state, action) {
    if (action.type !== "place") return gameError(GAME_ERROR.MALFORMED_ACTION, "That move wasn't understood.");
    const cell = action.payload?.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return gameError(GAME_ERROR.MALFORMED_ACTION, "That square doesn't exist.");
    const notYourTurn = requireTurn(state.turn, action.playerId);
    if (notYourTurn) return notYourTurn;
    if (state.cells[cell]) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That square is taken.");
    return null;
  },

  apply(state, action) {
    const cells = [...state.cells];
    cells[action.payload.cell] = action.playerId;
    const line = winningLine(cells);
    return { ...state, cells, line, turn: line ? state.turn : advanceTurn(state.turn) };
  },

  getResult(state) {
    if (state.line) return { outcome: "win", winnerId: state.cells[state.line[0]], summary: { line: state.line } };
    if (state.cells.every(Boolean)) return { outcome: "draw" };
    return null;
  },
};

export default rules;
