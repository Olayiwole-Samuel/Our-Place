/**
 * Codes for rejected game actions. Sent to the acting client (never broadcast)
 * so the UI can explain the rejection without exposing internals.
 */
export const GAME_ERROR = Object.freeze({
  SESSION_NOT_ACTIVE: "session_not_active",
  NOT_A_PLAYER: "not_a_player",
  MALFORMED_ACTION: "malformed_action",
  NOT_YOUR_TURN: "not_your_turn",
  ILLEGAL_ACTION: "illegal_action",
});

export function gameError(code, message = code) {
  return { code, message };
}
