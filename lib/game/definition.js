import { getCategory, isGameCategory } from "./categories";
import { AUTHORITY_MODELS, DECLARABLE_CAPABILITIES, GAME_MODES, MULTIPLAYER_MODELS } from "./capabilities";

const ID_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_COUPLE_PLAYERS = 2;

/**
 * Availability, decided by the catalog — never inferred:
 *   available    implemented (client + rules exist) and launchable
 *   coming_soon  registered so the roster is complete, honestly not playable yet
 *   locked       implemented but behind a gate the couple hasn't opened (e.g. 18+)
 *   disabled     temporarily switched off
 */
export const GAME_STATUSES = Object.freeze(["available", "coming_soon", "locked", "disabled"]);

/**
 * Where a game is played. "overlay" = a panel over the living room (the room,
 * characters, chat and voice stay present). Dedicated spaces (e.g. "range_room"
 * for Target Range) are future scenes loaded like the living room.
 */
const SPACE_PATTERN = /^(overlay|[a-z][a-z0-9_]*_room)$/;

/**
 * Expected rendering cost (docs/performance.md → Game budgets):
 *   light   2D/DOM over the living room (cards, boards, questions) — the default
 *   medium  light 3D or media over the room (a 3D board, video)
 *   heavy   its own 3D space (Target Range → Range Room); the living room must
 *           pause/unload while it runs
 */
/** How much room the game shell gives the game: a compact panel, or a wide board-first stage. */
export const GAME_LAYOUTS = Object.freeze(["panel", "board"]);

export const PERFORMANCE_PROFILES = Object.freeze(["light", "medium", "heavy"]);

/**
 * Validates and freezes a game definition — WHAT a game is, not how it plays.
 *
 * {
 *   id: "ludo",                     // stable snake_case id; persisted in game_sessions
 *   name: "Ludo",
 *   category: "board_strategy",     // one of GAME_CATEGORIES
 *   mode: "competitive",            // GAME_MODES
 *   multiplayer: "turn_based",      // MULTIPLAYER_MODELS
 *   authority: "server",            // AUTHORITY_MODELS (default "server")
 *   minPlayers: 2, maxPlayers: 2,
 *   winStreakEligible: true,        // per GAME, never per category
 *   capabilities: ["score_based"],  // DECLARABLE_CAPABILITIES
 *   description: "…",              // one short line for the game card
 *   icon: "🎲",                     // optional glyph for the game card (defaults to the category's emoji)
 *   status: "available",            // GAME_STATUSES (default "coming_soon")
 *   space: "overlay",               // where it's played (default "overlay")
 *   sessionDefaults: { rounds: 10 }, // per-session options the SERVER applies (clients can't set them)
 *   layout: "panel",                // game shell size: "panel" (default) or "board" (wide, for boards)
 *   loadClient: () => import("@/games/ludo/client"),  // lazy UI chunk      (required when available)
 *   loadRules:  () => import("@/games/ludo/rules"),   // lazy rules module  (required when available)
 * }
 *
 * `mature` is inherited from the category (never set per game). A game can only
 * be "available" when both loaders exist, so the menu can never offer a game
 * that isn't really implemented.
 */
export function defineGame(input) {
  if (!input || typeof input !== "object") throw new Error("Game definition must be an object.");

  const errors = [];
  const fail = (message) => errors.push(message);
  const definition = {
    authority: "server",
    minPlayers: 2,
    maxPlayers: 2,
    capabilities: [],
    description: "",
    status: "coming_soon",
    space: "overlay",
    performanceProfile: "light",
    layout: "panel",
    ...input,
  };

  if (typeof definition.id !== "string" || !ID_PATTERN.test(definition.id)) {
    fail("id must be a snake_case string");
  }
  if (typeof definition.name !== "string" || !definition.name.trim()) fail("name is required");
  if (!isGameCategory(definition.category)) fail(`unknown category "${definition.category}"`);
  if (!GAME_MODES.includes(definition.mode)) fail(`mode must be one of ${GAME_MODES.join(", ")}`);
  if (!MULTIPLAYER_MODELS.includes(definition.multiplayer)) {
    fail(`multiplayer must be one of ${MULTIPLAYER_MODELS.join(", ")}`);
  }
  if (!AUTHORITY_MODELS.includes(definition.authority)) {
    fail(`authority must be one of ${AUTHORITY_MODELS.join(", ")}`);
  }
  if (definition.mode === "competitive" && definition.authority !== "server") {
    fail(`competitive games must use authority "server" (clients never decide outcomes)`);
  }

  const { minPlayers, maxPlayers } = definition;
  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers) || minPlayers < 1 || minPlayers > maxPlayers) {
    fail("minPlayers/maxPlayers must be integers with 1 <= minPlayers <= maxPlayers");
  } else if (maxPlayers > MAX_COUPLE_PLAYERS) {
    fail("maxPlayers cannot exceed 2 (Our Place is for exactly two people)");
  }

  if (typeof definition.winStreakEligible !== "boolean") {
    fail("winStreakEligible must be declared explicitly (true/false)");
  } else if (definition.winStreakEligible && definition.mode !== "competitive") {
    fail("only competitive games can be win-streak eligible");
  }

  if (!Array.isArray(definition.capabilities)) {
    fail("capabilities must be an array");
  } else {
    for (const capability of definition.capabilities) {
      if (!DECLARABLE_CAPABILITIES.includes(capability)) fail(`unknown capability "${capability}"`);
    }
  }

  if (!GAME_STATUSES.includes(definition.status)) fail(`status must be one of ${GAME_STATUSES.join(", ")}`);
  if (typeof definition.space !== "string" || !SPACE_PATTERN.test(definition.space)) fail(`space must be "overlay" or "<name>_room"`);
  if (definition.sessionDefaults !== undefined && (typeof definition.sessionDefaults !== "object" || definition.sessionDefaults === null || Array.isArray(definition.sessionDefaults))) {
    fail("sessionDefaults must be a plain object");
  }
  if (definition.icon !== undefined && (typeof definition.icon !== "string" || [...definition.icon].length > 4)) fail("icon must be a short glyph (emoji)");
  if (!GAME_LAYOUTS.includes(definition.layout)) fail(`layout must be one of ${GAME_LAYOUTS.join(", ")}`);
  if (!PERFORMANCE_PROFILES.includes(definition.performanceProfile)) fail(`performanceProfile must be one of ${PERFORMANCE_PROFILES.join(", ")}`);
  if (definition.performanceProfile === "heavy" && definition.space === "overlay") fail("heavy games need their own space (not an overlay on the living room)");
  if (definition.status === "available") {
    if (typeof definition.loadClient !== "function") fail("an available game needs loadClient (a function returning import())");
    if (typeof definition.loadRules !== "function") fail("an available game needs loadRules (a function returning import())");
  }
  const category = getCategory(definition.category);
  if (category?.mature && definition.winStreakEligible) fail("18+ games are never win-streak eligible");

  if (errors.length) {
    throw new Error(`Game "${definition.id ?? "?"}" is invalid: ${errors.join("; ")}.`);
  }

  return Object.freeze({
    ...definition,
    icon: definition.icon ?? category?.emoji ?? "🎮",
    mature: Boolean(category?.mature),
    capabilities: Object.freeze([...definition.capabilities]),
  });
}
