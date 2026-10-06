/**
 * Session-level outcome codes and the only copy users ever see for them.
 * Database functions raise 'game:<code>'; the API maps them here. Raw database
 * errors are never shown.
 */
const COPY = {
  not_authenticated: { status: 401, message: "Your session ended. Sign in again to continue." },
  not_paired: { status: 403, message: "Pair with your person first." },
  not_found: { status: 404, message: "This game session has ended. Return to Our Place." },
  not_a_player: { status: 403, message: "You're not part of this game." },
  not_joinable: { status: 409, message: "This game has already started or ended." },
  full: { status: 409, message: "This game is already full." },
  session_open: { status: 409, message: "You already have a game open." },
  game_unavailable: { status: 409, message: "This game isn't ready yet." },
  invalid_request: { status: 400, message: "That didn't work. Try again." },
  invalid_transition: { status: 409, message: "That isn't possible right now." },
  conflict: { status: 409, message: "The game moved on — refreshing." },
  rate_limited: { status: 429, message: "Slow down a little — try again in a moment." },
  rejected: { status: 422, message: "That move isn't allowed." },
  start_failed: { status: 500, message: "Something went wrong starting the game." },
  questions_unavailable: { status: 503, message: "We couldn't get the next question." },
  unavailable: { status: 503, message: "Connection interrupted. Reconnecting…" },
  unknown: { status: 500, message: "Something went wrong starting the game." },
};

export const GAME_SESSION_ERROR = Object.freeze(Object.fromEntries(Object.keys(COPY).map((code) => [code.toUpperCase(), code])));

export function gameSessionErrorMessage(code) {
  return (COPY[code] ?? COPY.unknown).message;
}

export function gameSessionErrorStatus(code) {
  return (COPY[code] ?? COPY.unknown).status;
}

/** 'game:<code>' from the database → a known code. */
export function gameSessionErrorFromDatabase(error) {
  const match = /game:([a-z_]+)/.exec(error?.message ?? "");
  if (match && COPY[match[1]]) return match[1];
  if (/fetch failed|network|ECONNREFUSED|ETIMEDOUT/i.test(error?.message ?? "")) return "unavailable";
  return "unknown";
}

export class GameSessionError extends Error {
  constructor(code, { cause, detail } = {}) {
    super(code, { cause });
    this.name = "GameSessionError";
    this.code = COPY[code] ? code : "unknown";
    this.detail = detail ?? null;
  }
}
