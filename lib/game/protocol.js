/**
 * Wire protocol shared by the web client and the Colyseus game server.
 *
 * - Client → server: GAME_MESSAGE.ACTION with { type, payload }. The server attaches
 *   the authenticated playerId itself; a playerId sent by the client is ignored.
 * - Server → client: per-player STATE views (sent individually, so games with hidden
 *   information never broadcast private state), REJECTED to the acting client only,
 *   and RESULT once the engine settles the session.
 */
export const GAME_ROOM_NAME = "game_session";

export const GAME_MESSAGE = Object.freeze({
  ACTION: "game:action",
  STATE: "game:state",
  REJECTED: "game:rejected",
  RESULT: "game:result",
});
