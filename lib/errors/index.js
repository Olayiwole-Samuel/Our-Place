/**
 * Application error model. Every failure is classified into a category with a
 * human message and a recovery hint, so UI can explain what happened without
 * leaking technical detail. The original error is kept for logging only.
 */
export const ERROR_CATEGORY = Object.freeze({
  AUTH: "auth",
  CONNECTION: "connection",
  DATABASE: "database",
  REALTIME: "realtime",
  MULTIPLAYER: "multiplayer",
  ASSET_LOADING: "asset_loading",
  MEDIA_UPLOAD: "media_upload",
  GAME_SYNC: "game_sync",
  EXTERNAL_SERVICE: "external_service",
  UNKNOWN: "unknown",
});

/** User-facing copy per category. `recovery` maps to the action an ErrorState offers. */
const PRESENTATION = {
  auth: { title: "Let's sign you in again", message: "Your session ended. Sign in to get back to your place.", recovery: "reauth" },
  connection: { title: "We couldn't connect right now", message: "Check your connection, then try again.", recovery: "retry" },
  database: { title: "Something didn't save", message: "We couldn't reach your space just now.", recovery: "retry" },
  realtime: { title: "Reconnecting…", message: "We lost the live connection. Hang tight or try again.", recovery: "retry" },
  multiplayer: { title: "Game connection lost", message: "We couldn't reach the game. Your partner is still here.", recovery: "retry" },
  asset_loading: { title: "We couldn't load your space", message: "Something went wrong while opening your room. Check your connection, then try again.", recovery: "retry" },
  media_upload: { title: "Upload didn't finish", message: "That file didn't make it. Try again.", recovery: "retry" },
  game_sync: { title: "Out of sync", message: "The game got out of step. We'll resync it.", recovery: "retry" },
  external_service: { title: "That's unavailable right now", message: "A service we rely on isn't responding. Try again shortly.", recovery: "retry" },
  unknown: { title: "Something went wrong", message: "That wasn't supposed to happen. Try again.", recovery: "retry" },
};

export class AppError extends Error {
  constructor(category, { message, cause, context } = {}) {
    super(message ?? PRESENTATION[category]?.message ?? PRESENTATION.unknown.message, { cause });
    this.name = "AppError";
    this.category = PRESENTATION[category] ? category : ERROR_CATEGORY.UNKNOWN;
    this.context = context ?? null;
  }
}

/** Safe, displayable description of any thrown value. Never includes stack traces or raw messages. */
export function presentError(error) {
  const category = error instanceof AppError ? error.category : ERROR_CATEGORY.UNKNOWN;
  return { category, ...PRESENTATION[category] };
}

/**
 * Single reporting entry point. Logs to the console today; a monitoring service
 * plugs in here later without touching call sites.
 */
export function reportError(error, context = {}) {
  const category = error instanceof AppError ? error.category : ERROR_CATEGORY.UNKNOWN;
  console.error(`[our-place:${category}]`, error, { ...context, ...(error?.context ?? {}) });
}
