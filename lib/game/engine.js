import { GAME_ERROR, gameError } from "./errors";
import { normalizeResult } from "./result";

/**
 * Game-agnostic session engine.
 *
 * This module is the authoritative core that the multiplayer game server (Colyseus)
 * runs. It knows nothing about boards, turns, cards or targets — each game supplies
 * a RULES module and keeps whatever state shape it needs:
 *
 * {
 *   setup(ctx)                     -> initialState         (required)
 *   validate(state, action, ctx)   -> null | {code,message} (required)
 *   apply(state, action, ctx)      -> nextState             (required, pure)
 *   tick(state, ctx)               -> nextState             (optional; realtime games, ctx.deltaMs)
 *   getResult(state, ctx)          -> null | result         (optional; see result.js)
 *   view(state, playerId, ctx)     -> what that player may see (optional; hidden information)
 * }
 *
 * ctx = { playerIds, random, now, options, deltaMs? } — randomness and time come from
 * the server so clients cannot influence dice, shuffles, spawns or timers.
 *
 * Every function here is pure: it returns a new session and never mutates input.
 * Clients send intent ({ type, payload }); only this engine decides what happened.
 */

const REQUIRED_RULES = ["setup", "validate", "apply"];
const OPTIONAL_RULES = ["tick", "getResult", "view"];

export function assertGameRules(rules, gameId = "?") {
  for (const name of REQUIRED_RULES) {
    if (typeof rules?.[name] !== "function") throw new Error(`Rules for "${gameId}" must implement ${name}().`);
  }
  for (const name of OPTIONAL_RULES) {
    if (rules[name] !== undefined && typeof rules[name] !== "function") {
      throw new Error(`Rules for "${gameId}": ${name} must be a function when provided.`);
    }
  }
  return rules;
}

function buildContext(session, { random, now, deltaMs }) {
  return { playerIds: session.playerIds, options: session.options, random, now, deltaMs };
}

function settle(session, definition, rules, state, ctx) {
  const rawResult = rules.getResult ? rules.getResult(state, ctx) : null;
  const next = { ...session, state, version: session.version + 1 };
  if (!rawResult) return next;
  return {
    ...next,
    status: "completed",
    result: normalizeResult(definition, session.playerIds, rawResult),
    endedAt: ctx.now,
  };
}

/**
 * Starts a session. `playerIds` are authenticated user ids resolved by the server
 * from the couple record — never taken from client input.
 */
export function createSession({ id, definition, rules, coupleId, playerIds, options = {}, random, now }) {
  assertGameRules(rules, definition.id);
  if (playerIds.length < definition.minPlayers || playerIds.length > definition.maxPlayers) {
    throw new Error(`"${definition.id}" needs ${definition.minPlayers}-${definition.maxPlayers} players.`);
  }
  if (new Set(playerIds).size !== playerIds.length) throw new Error("Player ids must be unique.");

  const session = {
    id,
    gameId: definition.id,
    coupleId,
    playerIds: [...playerIds],
    options,
    status: "active",
    version: 0,
    state: null,
    result: null,
    startedAt: now,
    endedAt: null,
  };
  const ctx = buildContext(session, { random, now });
  return { ...session, state: rules.setup(ctx) };
}

/**
 * Applies one player action. Returns `{ ok: true, session }` or
 * `{ ok: false, error }` — a rejected action leaves the session untouched.
 */
export function applyPlayerAction(session, action, { definition, rules, random, now }) {
  if (session.status !== "active") {
    return { ok: false, error: gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has already ended.") };
  }
  if (!session.playerIds.includes(action?.playerId)) {
    return { ok: false, error: gameError(GAME_ERROR.NOT_A_PLAYER, "You're not a player in this game.") };
  }
  if (typeof action.type !== "string" || !action.type) {
    return { ok: false, error: gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.") };
  }

  const ctx = buildContext(session, { random, now });
  const rejection = rules.validate(session.state, action, ctx);
  if (rejection) return { ok: false, error: rejection };

  const state = rules.apply(session.state, action, ctx);
  return { ok: true, session: settle(session, definition, rules, state, ctx) };
}

/** Advances a realtime session by `deltaMs` (timers, target spawns, physics). No-op for games without tick(). */
export function tickSession(session, { definition, rules, random, now, deltaMs }) {
  if (session.status !== "active" || !rules.tick) return session;
  const ctx = buildContext(session, { random, now, deltaMs });
  return settle(session, definition, rules, rules.tick(session.state, ctx), ctx);
}

/** Ends a session early. Abandoned sessions never count toward win streaks. */
export function abandonSession(session, { now, reason = "left" }) {
  if (session.status !== "active") return session;
  return {
    ...session,
    status: "abandoned",
    version: session.version + 1,
    result: Object.freeze({ outcome: "abandoned", winnerId: null, scores: null, summary: { reason } }),
    endedAt: now,
  };
}

/** The state one player is allowed to see (e.g. hides the partner's Scrabble rack). */
export function getPlayerView(session, playerId, { rules, random, now }) {
  if (!rules.view) return session.state;
  return rules.view(session.state, playerId, buildContext(session, { random, now }));
}
