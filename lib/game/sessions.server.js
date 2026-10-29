import "server-only";
import { randomInt } from "node:crypto";
import { gameRegistry } from "./catalog";
import { applyPlayerAction, assertGameRules, createSession, getPlayerView } from "./engine";
import { gameAvailability } from "./gating";
import { createQuestionProvider } from "./questions/provider.server";
import { createRandom } from "./random";
import { countsTowardWinStreak } from "./result";
import { GameSessionError, gameSessionErrorFromDatabase } from "./sessionErrors";

/**
 * The game authority. Runs on the server only (API routes); clients send intent
 * and receive their own view. Every call takes the VERIFIED user id (from
 * Supabase Auth in the route), never one from the request body.
 *
 *   create   registry check (exists + launchable for this couple) → game_create_session
 *   join     game_join_session
 *   ready    game_set_ready → when both are ready, the engine sets the game up
 *            (server RNG) and game_start_session stores it
 *   action   game_note_action (membership + rate limit) → engine validate/apply
 *            → game_commit_state (versioned) → result normalized by the engine
 *   leave    game_leave_session (cancel before start / abandon during play)
 *   view     summary + this player's view of the state (rules.view hides
 *            anything the other player mustn't see)
 *
 * Persistence goes through the service-role client, but only via the game_*
 * database functions, which re-check couple membership themselves.
 */
const MAX_ACTION_BYTES = 2048;
const ACTION_TYPE = /^[a-z][a-z0-9_]{0,39}$/;
const OPEN_STATUSES = ["created", "waiting", "ready", "active", "paused"];
const SUMMARY_COLUMNS =
  "id, couple_id, game_id, status, created_by, players, ready, state_version, options, result, winner_id, streak_eligible, created_at, started_at, finished_at, updated_at";

/** Client-facing summary of a session row (never includes state or seed). */
export function toSessionSummary(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    gameId: row.game_id,
    status: row.status,
    createdBy: row.created_by,
    players: row.players ?? [],
    ready: row.ready ?? [],
    version: row.state_version,
    result: row.result ?? null,
    winnerId: row.winner_id ?? null,
    streakEligible: Boolean(row.streak_eligible),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

async function loadRules(definition) {
  const rulesModule = await definition.loadRules();
  return assertGameRules(rulesModule.default ?? rulesModule, definition.id);
}

/** Session object in the engine's shape, rebuilt from the authoritative row. */
function engineSession(row) {
  return {
    id: row.id,
    gameId: row.game_id,
    coupleId: row.couple_id,
    playerIds: row.players,
    options: row.options ?? {},
    status: row.status === "active" ? "active" : row.status,
    version: row.state_version,
    state: row.state,
    result: row.result ?? null,
    startedAt: row.started_at,
    endedAt: row.finished_at,
  };
}

/** Deterministic per-step randomness from the server-only seed (replayable, unguessable). */
const randomFor = (row) => createRandom(Number(row.seed ?? 0) + row.state_version * 7919);

export function createGameSessionService({ admin, matureEnabled = null, now = () => Date.now() }) {
  async function call(fn, args) {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new GameSessionError(gameSessionErrorFromDatabase(error), { cause: error });
    return Array.isArray(data) ? data[0] : data;
  }

  async function readRow(sessionId, userId, { withState = false } = {}) {
    const columns = withState ? `${SUMMARY_COLUMNS}, state, seed` : SUMMARY_COLUMNS;
    const { data, error } = await admin.from("game_sessions").select(columns).eq("id", sessionId).maybeSingle();
    if (error) throw new GameSessionError(gameSessionErrorFromDatabase(error), { cause: error });
    // The service client bypasses RLS, so membership is checked here explicitly.
    const coupleId = await coupleOf(userId);
    if (!data || data.couple_id !== coupleId) throw new GameSessionError("not_found");
    return data;
  }

  async function coupleOf(userId) {
    const { data, error } = await admin.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
    if (error) throw new GameSessionError(gameSessionErrorFromDatabase(error), { cause: error });
    if (!data) throw new GameSessionError("not_paired");
    return data.couple_id;
  }

  /**
   * 18+ games open only when BOTH partners have switched them on
   * (couple_members.mature_opt_in, 20261029000000_mature_opt_in.sql). Before
   * that migration the column doesn't exist, and they simply stay locked.
   */
  async function bothOptedIn(userId) {
    const coupleId = await coupleOf(userId);
    const { data, error } = await admin.from("couple_members").select("mature_opt_in").eq("couple_id", coupleId);
    if (error) return false;
    return (data ?? []).length === 2 && data.every((row) => row.mature_opt_in === true);
  }
  const isMatureEnabled = matureEnabled ?? bothOptedIn;

  function definitionFor(gameId) {
    const definition = gameRegistry.get(gameId);
    if (!definition) throw new GameSessionError("game_unavailable");
    return definition;
  }

  // Win streaks are written by the database when a streak-eligible session
  // completes (20261011000000_win_streaks.sql); the finish screen shows them.
  let streaksUnavailable = false;
  async function streaksFor(row) {
    if (row.status !== "completed" || !row.streak_eligible || streaksUnavailable) return null;
    const { data, error } = await admin.from("win_streaks").select("user_id, current, best").eq("couple_id", row.couple_id).eq("game_id", row.game_id);
    if (error) {
      streaksUnavailable = true;
      console.warn("[games] win streaks unavailable; finish screens won't show them");
      return null;
    }
    return Object.fromEntries((data ?? []).map((streak) => [streak.user_id, { current: streak.current, best: streak.best }]));
  }

  async function viewFor(row, userId) {
    const summary = toSessionSummary(row);
    const streaks = await streaksFor(row);
    if (streaks) summary.streaks = streaks;
    if (!["active", "completed"].includes(row.status) || row.state == null) return { session: summary, view: null };
    const definition = definitionFor(row.game_id);
    const rules = await loadRules(definition);
    const view = getPlayerView(engineSession(row), userId, { rules, random: randomFor(row), now: now() });
    return { session: summary, view };
  }

  // Server-side content for games that need it before setup (questions now; AI later).
  const services = { questions: createQuestionProvider({ admin }) };

  async function start(row, userId) {
    const definition = definitionFor(row.game_id);
    const rules = await loadRules(definition);
    const seed = randomInt(0, 2 ** 31 - 1);
    let options = row.options ?? {};
    if (rules.prepare) {
      // Optional rules hook: fetch content (e.g. this session's questions) on the
      // server. Only one request ever sees both players ready (the row is locked),
      // so content is drawn once per session.
      try {
        options = { ...options, ...(await rules.prepare({ coupleId: row.couple_id, playerIds: row.players, options, random: createRandom(seed ^ 0x5f3759df), services })) };
      } catch (error) {
        await call("game_leave_session", { p_user: userId, p_session: row.id }).catch(() => {}); // cancelled, not stuck "starting"
        throw new GameSessionError("questions_unavailable", { cause: error });
      }
    }
    const engine = createSession({
      id: row.id,
      definition,
      rules,
      coupleId: row.couple_id,
      playerIds: row.players, // from the database, never from the client
      options,
      random: createRandom(seed),
      now: now(),
    });
    const started = await call("game_start_session", { p_session: row.id, p_state: engine.state, p_seed: seed });
    return started?.id ? started : null; // null: the partner's request started it first
  }

  return {
    async create(userId, gameId) {
      if (typeof gameId !== "string") throw new GameSessionError("invalid_request");
      const definition = definitionFor(gameId);
      const { launchable } = gameAvailability(definition, { matureEnabled: definition.mature ? await isMatureEnabled(userId) : false });
      if (!launchable) throw new GameSessionError("game_unavailable");
      // Session options come from the game's definition, never from the client.
      return toSessionSummary(await call("game_create_session", { p_user: userId, p_game_id: definition.id, p_options: definition.sessionDefaults ?? {} }));
    },

    async join(userId, sessionId) {
      return toSessionSummary(await call("game_join_session", { p_user: userId, p_session: sessionId }));
    },

    async ready(userId, sessionId, isReady) {
      if (typeof isReady !== "boolean") throw new GameSessionError("invalid_request");
      const row = await call("game_set_ready", { p_user: userId, p_session: sessionId, p_ready: isReady });
      if (row.status !== "ready") return toSessionSummary(row);
      try {
        await start(row, userId);
      } catch (error) {
        if (error instanceof GameSessionError) throw error;
        throw new GameSessionError("start_failed", { cause: error });
      }
      return (await viewFor(await readRow(sessionId, userId, { withState: true }), userId)).session;
    },

    async action(userId, sessionId, body) {
      const type = body?.type;
      const payload = body?.payload ?? {};
      if (typeof type !== "string" || !ACTION_TYPE.test(type) || typeof payload !== "object" || Array.isArray(payload)) {
        throw new GameSessionError("invalid_request");
      }
      if (JSON.stringify(payload).length > MAX_ACTION_BYTES) throw new GameSessionError("invalid_request");
      await call("game_note_action", { p_user: userId, p_session: sessionId }); // membership + rate limit
      const row = await readRow(sessionId, userId, { withState: true });
      if (row.status !== "active") throw new GameSessionError("invalid_transition");
      if (Number.isInteger(body.version) && body.version !== row.state_version) throw new GameSessionError("conflict");

      const definition = definitionFor(row.game_id);
      const rules = await loadRules(definition);
      // The acting player is the verified user; any playerId in the body is ignored.
      const outcome = applyPlayerAction(engineSession(row), { type, payload, playerId: userId }, { definition, rules, random: randomFor(row), now: now() });
      if (!outcome.ok) throw new GameSessionError("rejected", { detail: { code: outcome.error.code, message: outcome.error.message } });

      const next = outcome.session;
      const completed = next.status === "completed";
      const committed = await call("game_commit_state", {
        p_session: row.id,
        p_expected_version: row.state_version,
        p_state: next.state,
        p_status: completed ? "completed" : "active",
        p_result: completed ? next.result : null,
        p_winner: completed ? next.result.winnerId : null,
        p_streak_eligible: completed ? countsTowardWinStreak(definition, next.result) : false,
      });
      return viewFor({ ...committed, state: next.state, seed: row.seed }, userId);
    },

    async leave(userId, sessionId) {
      return toSessionSummary(await call("game_leave_session", { p_user: userId, p_session: sessionId }));
    },

    async view(userId, sessionId) {
      return viewFor(await readRow(sessionId, userId, { withState: true }), userId);
    },

    /** The couple's open session (to resume after a reload/reconnect), or the one that just finished. */
    async current(userId) {
      const coupleId = await coupleOf(userId);
      const { data, error } = await admin
        .from("game_sessions")
        .select(`${SUMMARY_COLUMNS}, state, seed`)
        .eq("couple_id", coupleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new GameSessionError(gameSessionErrorFromDatabase(error), { cause: error });
      if (!data) return { session: null, view: null };
      const recent = OPEN_STATUSES.includes(data.status) || (data.finished_at && now() - Date.parse(data.finished_at) < 2 * 60_000);
      return recent ? viewFor(data, userId) : { session: null, view: null };
    },
  };
}
