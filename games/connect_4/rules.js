import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { advanceTurn, createTurnOrder, currentPlayer, requireTurn } from "@/lib/game/turns";

/**
 * Connect 4 — 7 columns × 6 rows. Drop a disc into a column; it falls to the
 * lowest empty space. Four of your discs in a row (across, up, or diagonal)
 * wins; a full board is a draw. Pure rules run by the server; clients send
 * { type: "drop", payload: { column } } only.
 *
 * State: { cells: (playerId|null)[42] (row 0 = top), colors: { [playerId]: "red"|"yellow" },
 *          turn, last: { column, row, by } | null, line: number[] | null }
 * Red goes first and is chosen by the server's seeded random.
 */
export const COLUMNS = 7;
export const ROWS = 6;
const at = (row, column) => row * COLUMNS + column;

/** The four cells of a winning line through the disc at (row, column), or null. */
export function lineThrough(cells, row, column) {
  const owner = cells[at(row, column)];
  if (!owner) return null;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const line = [at(row, column)];
    for (const sign of [1, -1]) {
      for (let r = row + dr * sign, c = column + dc * sign; r >= 0 && r < ROWS && c >= 0 && c < COLUMNS && cells[at(r, c)] === owner; r += dr * sign, c += dc * sign) {
        line.push(at(r, c));
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}

/** The row a disc dropped in `column` lands on, or -1 when the column is full. */
export function landingRow(cells, column) {
  for (let row = ROWS - 1; row >= 0; row--) if (!cells[at(row, column)]) return row;
  return -1;
}

const rules = {
  setup({ playerIds, random }) {
    const turn = createTurnOrder(playerIds, random.int(0, playerIds.length - 1));
    const red = currentPlayer(turn);
    return {
      cells: Array(COLUMNS * ROWS).fill(null),
      colors: Object.fromEntries(playerIds.map((id) => [id, id === red ? "red" : "yellow"])),
      turn,
      last: null,
      line: null,
    };
  },

  validate(state, action) {
    if (action.type !== "drop") return gameError(GAME_ERROR.MALFORMED_ACTION, "That move wasn't understood.");
    const column = action.payload?.column;
    if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) return gameError(GAME_ERROR.MALFORMED_ACTION, "That column doesn't exist.");
    if (state.line) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    const notYourTurn = requireTurn(state.turn, action.playerId);
    if (notYourTurn) return notYourTurn;
    if (landingRow(state.cells, column) < 0) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That column is full.");
    return null;
  },

  apply(state, action) {
    const { column } = action.payload;
    const row = landingRow(state.cells, column);
    const cells = [...state.cells];
    cells[at(row, column)] = action.playerId;
    const line = lineThrough(cells, row, column);
    return { ...state, cells, line, last: { column, row, by: action.playerId }, turn: line ? state.turn : advanceTurn(state.turn) };
  },

  getResult(state) {
    if (state.line) return { outcome: "win", winnerId: state.cells[state.line[0]], summary: { line: state.line } };
    if (state.cells.every(Boolean)) return { outcome: "draw" };
    return null;
  },
};

export default rules;
