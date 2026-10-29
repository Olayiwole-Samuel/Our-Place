import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Truth or Dare (18+) — a conversation game: no winner, no streak. Pure rules
 * run by the server; the prompts come from the server's question provider
 * (lib/game/questions/spicy.js), never from a client.
 *
 * Turns alternate. On your turn pick Truth or Dare; the prompt shows for both
 * of you. Answer or do it — out loud on voice, in chat, or with a photo — then
 * tap Done. Or chicken out (it's counted 🐔). Your partner can react while you
 * do it. Then it's their turn. `rounds` turns in all (6 each by default).
 *
 * State: { rounds, round, order, current, phase: "choosing"|"doing"|"finished",
 *          decks: { truth: [], dare: [] }, used: { truth, dare }, prompt, reaction,
 *          tally: { [playerId]: { truth, dare, chicken } }, history: [] }
 *
 * Actions: choose { kind: "truth"|"dare" }  done {}  chicken {}  react { emoji }  finish {}
 */
export const DEFAULT_ROUNDS = 12;
export const REACTIONS = Object.freeze(["❤️", "🔥", "😳", "😂", "🥵", "😈"]);
const KINDS = new Set(["truth", "dare"]);

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const rounds = Math.min(30, Math.max(2, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
    const [truths, dares] = await Promise.all([
      services.questions.draw({ gameId: "truth_or_dare_truth", coupleId, count: rounds, random }),
      services.questions.draw({ gameId: "truth_or_dare_dare", coupleId, count: rounds, random }),
    ]);
    return { rounds, truths, dares };
  },

  setup({ playerIds, options, random }) {
    const deck = (list) => list.map(({ id, text }) => ({ id, text }));
    return {
      rounds: options.rounds,
      round: 1,
      order: [...playerIds],
      current: playerIds[random.int(0, playerIds.length - 1)],
      phase: "choosing",
      decks: { truth: deck(options.truths), dare: deck(options.dares) },
      used: { truth: 0, dare: 0 },
      prompt: null,
      reaction: null,
      tally: Object.fromEntries(playerIds.map((id) => [id, { truth: 0, dare: 0, chicken: 0 }])),
      history: [],
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "finish") return null;
    if (type === "react") {
      if (state.phase !== "doing" || playerId === state.current) return gameError(GAME_ERROR.ILLEGAL_ACTION, "React while your partner is on.");
      if (!REACTIONS.includes(action.payload?.emoji)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Pick a reaction.");
      return null;
    }
    if (playerId !== state.current) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    if (type === "choose") {
      if (state.phase !== "choosing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "You've already picked.");
      const kind = action.payload?.kind;
      if (!KINDS.has(kind)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Truth or dare?");
      if (state.used[kind] >= state.decks[kind].length) return gameError(GAME_ERROR.ILLEGAL_ACTION, `No ${kind}s left — pick the other one.`);
      return null;
    }
    if (type === "done" || type === "chicken") {
      if (state.phase !== "doing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "Pick truth or dare first.");
      return null;
    }
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action) {
    const { type, playerId } = action;
    if (type === "finish") return { ...state, phase: "finished" };
    if (type === "react") return { ...state, reaction: { by: playerId, emoji: action.payload.emoji, at: state.history.length } };
    if (type === "choose") {
      const kind = action.payload.kind;
      const prompt = { ...state.decks[kind][state.used[kind]], kind };
      return { ...state, phase: "doing", prompt, reaction: null, used: { ...state.used, [kind]: state.used[kind] + 1 } };
    }
    // done / chicken: the turn passes.
    const chicken = type === "chicken";
    const mine = state.tally[playerId];
    const tally = { ...state.tally, [playerId]: { ...mine, [state.prompt.kind]: mine[state.prompt.kind] + (chicken ? 0 : 1), chicken: mine.chicken + (chicken ? 1 : 0) } };
    const history = [...state.history, { by: playerId, kind: state.prompt.kind, promptId: state.prompt.id, chicken, reaction: state.reaction?.emoji ?? null }];
    const next = state.order.find((id) => id !== playerId) ?? playerId;
    const finished = state.round >= state.rounds;
    return { ...state, tally, history, prompt: finished ? state.prompt : null, phase: finished ? "finished" : "choosing", round: finished ? state.round : state.round + 1, current: finished ? state.current : next, last: { by: playerId, chicken } };
  },

  getResult(state) {
    if (state.phase !== "finished") return null;
    const tallies = Object.values(state.tally);
    const sum = (key) => tallies.reduce((n, t) => n + t[key], 0);
    const chickens = sum("chicken");
    const line = state.history.length === 0 ? "See you next time 😉" : `${sum("truth")} truths, ${sum("dare")} dares${chickens ? `, ${chickens} chicken${chickens === 1 ? "" : "s"} 🐔` : " — nobody chickened out 🔥"}`;
    return { outcome: "completed", summary: { headline: "That got spicy 😈", line, turns: state.history.length } };
  },

  view(state) {
    return {
      rounds: state.rounds,
      round: state.round,
      current: state.current,
      phase: state.phase,
      prompt: state.prompt,
      reaction: state.reaction,
      tally: state.tally,
      left: { truth: state.decks.truth.length - state.used.truth, dare: state.decks.dare.length - state.used.dare },
      last: state.last ?? null,
      turns: state.history.length,
    };
  },
};

export default rules;
