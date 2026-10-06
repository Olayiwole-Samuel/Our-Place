/**
 * Gameplay vocabulary. Behaviour is derived from a game's metadata — never from a
 * hard-coded list of game ids or categories.
 */

/** What kind of experience a game is. Not every game has a winner. */
export const GAME_MODES = Object.freeze(["competitive", "cooperative", "conversation", "creative"]);

/** How actions flow in time. */
export const MULTIPLAYER_MODELS = Object.freeze(["turn_based", "realtime"]);

/**
 * Who decides what happened:
 * - "server": the game server validates every action and computes all outcomes
 *   (required for anything competitive).
 * - "relay": the server orders and relays actions with light shape validation —
 *   for creative/shared activities (drawing strokes, watch-together sync) where
 *   there is nothing to win.
 */
export const AUTHORITY_MODELS = Object.freeze(["server", "relay"]);

/** Optional flags a definition may declare in `capabilities`. */
export const DECLARABLE_CAPABILITIES = Object.freeze([
  "timed",
  "score_based",
  "ai_generated",
  "voice_enabled",
  "spectator_free",
  "hidden_information",
]);

/**
 * Full capability set for a definition: declared flags plus those implied by
 * metadata (turn_based/realtime, competitive/cooperative/conversation,
 * win_streak_eligible).
 */
export function getCapabilities(definition) {
  const capabilities = new Set(definition.capabilities);
  capabilities.add(definition.multiplayer);
  if (definition.mode !== "creative") capabilities.add(definition.mode);
  if (definition.winStreakEligible) capabilities.add("win_streak_eligible");
  return capabilities;
}

export function hasCapability(definition, capability) {
  return getCapabilities(definition).has(capability);
}

/**
 * The same capabilities as named flags (what the menu, shell and future
 * systems read), plus facts the platform needs to route a game. Always derived
 * from the definition — never stored twice.
 */
export function capabilityFlags(definition) {
  const set = getCapabilities(definition);
  return Object.freeze({
    turnBased: set.has("turn_based"),
    realtime: set.has("realtime"),
    cooperative: set.has("cooperative"),
    competitive: set.has("competitive"),
    conversation: set.has("conversation"),
    creative: definition.mode === "creative",
    timed: set.has("timed"),
    scoreBased: set.has("score_based"),
    hiddenInformation: set.has("hidden_information"),
    aiGenerated: set.has("ai_generated"),
    voiceEnabled: set.has("voice_enabled"),
    winStreakEligible: set.has("win_streak_eligible"),
  });
}

/**
 * Routing facts:
 *   needsRealtimeServer  realtime action play needs a server tick loop (the
 *                        planned Colyseus game server); turn-based and
 *                        conversation games run on the request/response authority
 *   needsAi              prompts come from AI generation (a later phase)
 *   is3d                 renders its own 3D (not a panel over the living room)
 *   needsRoom            plays in a dedicated space (e.g. "range_room")
 */
export function gameRequirements(definition) {
  return Object.freeze({
    // Conversation games are event-driven (answer → reveal → next): they run on
    // the request/response authority. Realtime action games need a tick loop.
    needsRealtimeServer: definition.multiplayer === "realtime" && definition.authority === "server" && definition.mode !== "conversation",
    needsAi: getCapabilities(definition).has("ai_generated"),
    is3d: definition.space !== "overlay" || definition.performanceProfile === "heavy",
    needsRoom: definition.space !== "overlay",
  });
}
