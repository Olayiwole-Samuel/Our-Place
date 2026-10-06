import { GAME_ERROR, gameError } from "./errors";

/**
 * Optional helpers for turn-based games. Nothing in the engine requires a turn —
 * realtime, cooperative and conversation games simply don't use these.
 * Store the returned object somewhere in your game state (e.g. `state.turn`).
 */
export function createTurnOrder(playerIds, firstIndex = 0) {
  return { order: [...playerIds], index: firstIndex, number: 1 };
}

export function currentPlayer(turn) {
  return turn.order[turn.index];
}

export function advanceTurn(turn) {
  return { ...turn, index: (turn.index + 1) % turn.order.length, number: turn.number + 1 };
}

/** For use inside `rules.validate`: returns an error when it is not `playerId`'s turn. */
export function requireTurn(turn, playerId) {
  return currentPlayer(turn) === playerId ? null : gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
}
