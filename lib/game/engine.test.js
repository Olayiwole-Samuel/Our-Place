import { describe, expect, it } from "vitest";
import { defineGame } from "./definition";
import { abandonSession, applyPlayerAction, createSession, getPlayerView, tickSession } from "./engine";
import { GAME_ERROR, gameError } from "./errors";
import { createRandom } from "./random";
import { countsTowardWinStreak } from "./result";
import { advanceTurn, createTurnOrder, currentPlayer, requireTurn } from "./turns";

// Minimal test-only games, one per gameplay model. They exist to prove the engine
// is game-agnostic; they are not product games.
const loaders = { loadClient: async () => ({}), loadRules: async () => ({}) };
const A = "user-a";
const B = "user-b";

// Turn-based competitive: roll a server die, first to 10 points wins. Rolls are hidden from the partner.
const diceRace = {
  definition: defineGame({ id: "dice_race", name: "Dice Race", category: "board_strategy", mode: "competitive", multiplayer: "turn_based", winStreakEligible: true, ...loaders }),
  rules: {
    setup: ({ playerIds }) => ({ turn: createTurnOrder(playerIds), points: { [A]: 0, [B]: 0 }, lastRoll: null }),
    validate: (state, action) =>
      requireTurn(state.turn, action.playerId) ??
      (action.type === "roll" ? null : gameError(GAME_ERROR.ILLEGAL_ACTION, "Unknown move.")),
    apply: (state, action, { random }) => {
      const roll = random.int(1, 6); // server decides the die — never the client
      return {
        turn: advanceTurn(state.turn),
        points: { ...state.points, [action.playerId]: state.points[action.playerId] + roll },
        lastRoll: { by: action.playerId, roll },
      };
    },
    getResult: (state) => {
      const winner = Object.keys(state.points).find((id) => state.points[id] >= 10);
      return winner ? { outcome: "win", winnerId: winner, scores: state.points } : null;
    },
    view: (state, playerId) => ({ ...state, lastRoll: state.lastRoll?.by === playerId ? state.lastRoll : null }),
  },
};

// Realtime cooperative: no turns; both players hit targets until a server timer runs out.
const coopTargets = {
  definition: defineGame({ id: "coop_targets", name: "Co-op Targets", category: "co_op", mode: "cooperative", multiplayer: "realtime", winStreakEligible: false, capabilities: ["timed"], ...loaders }),
  rules: {
    setup: () => ({ remainingMs: 1000, hits: 0, goal: 3 }),
    validate: (state, action) => (action.type === "hit" ? null : gameError(GAME_ERROR.ILLEGAL_ACTION)),
    apply: (state) => ({ ...state, hits: state.hits + 1 }),
    tick: (state, { deltaMs }) => ({ ...state, remainingMs: Math.max(0, state.remainingMs - deltaMs) }),
    getResult: (state) => {
      if (state.hits >= state.goal) return { outcome: "completed" };
      return state.remainingMs === 0 ? { outcome: "failed" } : null;
    },
  },
};

// Conversation: answer prompts; there is no winner and no score.
const prompts = {
  definition: defineGame({ id: "prompts", name: "Prompts", category: "talk_party", mode: "conversation", multiplayer: "realtime", winStreakEligible: false, ...loaders }),
  rules: {
    setup: () => ({ round: 1, rounds: 1, responses: {} }),
    validate: (state, action) => (action.type === "answer" && ["a", "b"].includes(action.payload) ? null : gameError(GAME_ERROR.ILLEGAL_ACTION)),
    apply: (state, action) => ({ ...state, responses: { ...state.responses, [action.playerId]: action.payload } }),
    getResult: (state, { playerIds }) => (playerIds.every((id) => state.responses[id]) ? { outcome: "completed" } : null),
  },
};

function start({ definition, rules }, seed = 42) {
  const random = createRandom(seed);
  const session = createSession({ id: "s1", definition, rules, coupleId: "c1", playerIds: [A, B], random, now: 0 });
  return { session, deps: { definition, rules, random, now: 1 } };
}

describe("turn-based competitive", () => {
  it("enforces turn order and membership", () => {
    const { session, deps } = start(diceRace);
    expect(currentPlayer(session.state.turn)).toBe(A);
    expect(applyPlayerAction(session, { playerId: B, type: "roll" }, deps).error.code).toBe(GAME_ERROR.NOT_YOUR_TURN);
    expect(applyPlayerAction(session, { playerId: "intruder", type: "roll" }, deps).error.code).toBe(GAME_ERROR.NOT_A_PLAYER);
    expect(applyPlayerAction(session, { playerId: A }, deps).error.code).toBe(GAME_ERROR.MALFORMED_ACTION);
  });

  it("plays to a server-decided winner that counts toward the win streak", () => {
    let { session, deps } = start(diceRace);
    while (session.status === "active") {
      const playerId = currentPlayer(session.state.turn);
      const outcome = applyPlayerAction(session, { playerId, type: "roll", payload: { roll: 6 } }, deps);
      expect(outcome.ok).toBe(true);
      session = outcome.session;
    }
    expect(session.result.outcome).toBe("win");
    expect(session.result.scores[session.result.winnerId]).toBeGreaterThanOrEqual(10);
    expect(countsTowardWinStreak(diceRace.definition, session.result)).toBe(true);
    expect(applyPlayerAction(session, { playerId: A, type: "roll" }, deps).error.code).toBe(GAME_ERROR.SESSION_NOT_ACTIVE);
  });

  it("is deterministic for a given server seed", () => {
    const play = () => {
      const { session, deps } = start(diceRace, 7);
      return applyPlayerAction(session, { playerId: A, type: "roll" }, deps).session.state.points[A];
    };
    expect(play()).toBe(play());
  });

  it("serves per-player views for hidden information", () => {
    const { session, deps } = start(diceRace);
    const next = applyPlayerAction(session, { playerId: A, type: "roll" }, deps).session;
    expect(getPlayerView(next, A, deps).lastRoll.by).toBe(A);
    expect(getPlayerView(next, B, deps).lastRoll).toBeNull();
  });

  it("never mutates the previous session", () => {
    const { session, deps } = start(diceRace);
    const snapshot = structuredClone(session);
    applyPlayerAction(session, { playerId: A, type: "roll" }, deps);
    expect(session).toEqual(snapshot);
  });
});

describe("realtime cooperative", () => {
  it("accepts actions from both players without turns and completes together", () => {
    let { session, deps } = start(coopTargets);
    for (const playerId of [A, B, B]) session = applyPlayerAction(session, { playerId, type: "hit" }, deps).session;
    expect(session.result).toMatchObject({ outcome: "completed", winnerId: null });
    expect(countsTowardWinStreak(coopTargets.definition, session.result)).toBe(false);
  });

  it("fails when the server timer runs out", () => {
    let { session, deps } = start(coopTargets);
    session = tickSession(session, { ...deps, deltaMs: 600 });
    expect(session.status).toBe("active");
    session = tickSession(session, { ...deps, deltaMs: 600 });
    expect(session.result.outcome).toBe("failed");
  });
});

describe("conversation", () => {
  it("completes with no winner and no score", () => {
    let { session, deps } = start(prompts);
    expect(applyPlayerAction(session, { playerId: A, type: "answer", payload: "z" }, deps).ok).toBe(false);
    session = applyPlayerAction(session, { playerId: A, type: "answer", payload: "a" }, deps).session;
    session = applyPlayerAction(session, { playerId: B, type: "answer", payload: "b" }, deps).session;
    expect(session.result).toEqual({ outcome: "completed", winnerId: null, scores: null, summary: null });
  });

  it("rejects outcomes that do not fit the game mode", () => {
    const cheating = { ...prompts.rules, getResult: () => ({ outcome: "win", winnerId: A }) };
    const { session, deps } = start({ ...prompts, rules: cheating });
    expect(() => applyPlayerAction(session, { playerId: A, type: "answer", payload: "a" }, { ...deps, rules: cheating })).toThrow(/not valid/);
  });
});

describe("session lifecycle", () => {
  it("rejects sessions with the wrong number of players", () => {
    expect(() =>
      createSession({ id: "s", definition: diceRace.definition, rules: diceRace.rules, coupleId: "c", playerIds: [A], random: createRandom(1), now: 0 }),
    ).toThrow(/players/);
  });

  it("abandoned sessions never count toward streaks", () => {
    const { session } = start(diceRace);
    const ended = abandonSession(session, { now: 5, reason: "disconnect" });
    expect(ended.status).toBe("abandoned");
    expect(countsTowardWinStreak(diceRace.definition, ended.result)).toBe(false);
  });
});
