import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { cleanText } from "@/lib/game/text";

/**
 * Two Truths and a Lie — a conversation game (no winner, no streak; the tally
 * is just for fun). Rounds alternate: the teller writes three things about
 * themselves, two true and one a lie, and marks the lie; the guesser picks
 * which one is the lie; then it's revealed. Pure rules run by the server.
 *
 * Hidden information: the server shuffles the three statements, and the
 * guesser's view never says which is the lie until it's revealed.
 *
 * Actions:
 *   write { statements: [a, b, c], lie: 0|1|2 }   teller, phase "writing" (each 2–120 characters)
 *   guess { index }                               guesser, phase "guessing"
 *   next {}                                       either, phase "reveal"
 *   finish {}                                     either
 */
export const DEFAULT_ROUNDS = 4;
export const MAX_STATEMENT = 120;

const rules = {
  setup({ playerIds, random, options }) {
    return {
      rounds: Number.isInteger(options?.rounds) ? Math.min(10, Math.max(2, options.rounds)) : DEFAULT_ROUNDS,
      round: 1,
      order: [...playerIds],
      teller: playerIds[random.int(0, playerIds.length - 1)],
      phase: "writing",
      statements: null,
      lie: null,
      guess: null,
      caught: Object.fromEntries(playerIds.map((id) => [id, 0])), // lies you spotted
      fooled: Object.fromEntries(playerIds.map((id) => [id, 0])), // times you fooled your partner
      history: [],
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "finish") return null;
    if (type === "write") {
      if (state.phase !== "writing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "They're already written.");
      if (playerId !== state.teller) return gameError(GAME_ERROR.NOT_YOUR_TURN, "Your partner is writing this round.");
      const { statements, lie } = action.payload ?? {};
      if (!Array.isArray(statements) || statements.length !== 3 || !statements.every((s) => cleanText(s, MAX_STATEMENT, 2))) {
        return gameError(GAME_ERROR.MALFORMED_ACTION, "Write three things — each a few words, up to 120 characters.");
      }
      if (![0, 1, 2].includes(lie)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Mark which one is the lie.");
      return null;
    }
    if (type === "guess") {
      if (state.phase !== "guessing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "Not time to guess.");
      if (playerId === state.teller) return gameError(GAME_ERROR.NOT_YOUR_TURN, "Your partner is guessing.");
      if (![0, 1, 2].includes(action.payload?.index)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Pick one of the three.");
      return null;
    }
    if (type === "next") return state.phase === "reveal" ? null : gameError(GAME_ERROR.ILLEGAL_ACTION, "Not revealed yet.");
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action, ctx) {
    const { type, playerId } = action;
    if (type === "finish") return { ...state, phase: "finished" };
    if (type === "write") {
      // Shuffle so the lie's position says nothing about the order they were written in.
      const written = action.payload.statements.map((s, i) => ({ text: cleanText(s, MAX_STATEMENT, 2), lie: i === action.payload.lie }));
      const shuffled = ctx.random.shuffle(written);
      return { ...state, phase: "guessing", statements: shuffled.map((s) => s.text), lie: shuffled.findIndex((s) => s.lie), guess: null };
    }
    if (type === "guess") {
      const right = action.payload.index === state.lie;
      const caught = right ? { ...state.caught, [playerId]: state.caught[playerId] + 1 } : state.caught;
      const fooled = right ? state.fooled : { ...state.fooled, [state.teller]: state.fooled[state.teller] + 1 };
      const history = [...state.history, { teller: state.teller, right }];
      return { ...state, guess: action.payload.index, caught, fooled, history, phase: "reveal" };
    }
    // next
    if (state.round >= state.rounds) return { ...state, phase: "finished" };
    return { ...state, round: state.round + 1, teller: state.order.find((id) => id !== state.teller), phase: "writing", statements: null, lie: null, guess: null };
  },

  getResult(state) {
    if (state.phase !== "finished") return null;
    const played = state.history.length;
    const spotted = state.history.filter((h) => h.right).length;
    const line = played === 0 ? "See you next time ❤️" : `${spotted} of ${played} lies spotted — ${spotted * 2 >= played ? "you know each other well 👀" : "smooth liars, both of you 😏"}`;
    return { outcome: "completed", summary: { headline: "Truth's out 🤥", line, rounds: played, spotted } };
  },

  view(state, playerId) {
    const teller = playerId === state.teller;
    const revealed = state.phase === "reveal" || state.phase === "finished";
    return {
      rounds: state.rounds,
      round: state.round,
      phase: state.phase,
      teller: state.teller,
      statements: state.statements,
      lie: teller || revealed ? state.lie : null,
      guess: state.guess,
      caught: state.caught,
      fooled: state.fooled,
    };
  },
};

export default rules;
