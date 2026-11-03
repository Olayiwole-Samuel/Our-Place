import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Guess My Answer — a conversation game (no winner, no streak; the tally is for
 * fun). Rounds alternate: a question with four options — one of you picks their
 * own answer, the other predicts it, both in secret. Revealed together: a right
 * prediction scores the guesser a point. Pure rules run by the server.
 *
 * Hidden information: your partner's pick is never in your view until you've
 * both chosen.
 *
 * Actions: choose { index }  next {}  finish {}
 */
export const DEFAULT_ROUNDS = 8;

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const rounds = Math.min(20, Math.max(2, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
    const questions = await services.questions.draw({ gameId: "guess_my_answer", coupleId, count: rounds, random });
    return { rounds: Math.min(rounds, questions.length), questions: questions.map(({ id, text, options: choices }) => ({ id, text, options: choices })) };
  },

  setup({ playerIds, options, random }) {
    const each = (value) => Object.fromEntries(playerIds.map((id) => [id, value]));
    return {
      rounds: options.rounds,
      round: 1,
      order: [...playerIds],
      deck: options.questions,
      subject: playerIds[random.int(0, playerIds.length - 1)],
      choices: each(null),
      next: each(false),
      phase: "choosing",
      scores: each(0),
      history: [],
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "finish") return null;
    if (type === "choose") {
      if (state.phase !== "choosing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "This round has been revealed.");
      if (state.choices[playerId] !== null) return gameError("already_answered", "You've already chosen.");
      const { index } = action.payload ?? {};
      if (!Number.isInteger(index) || index < 0 || index >= state.deck[state.round - 1].options.length) return gameError(GAME_ERROR.MALFORMED_ACTION, "Pick one of the options.");
      return null;
    }
    if (type === "next") {
      if (state.phase !== "revealing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "Not revealed yet.");
      return state.next[playerId] ? gameError("already_ready", "Waiting for your partner.") : null;
    }
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action) {
    const { type, playerId } = action;
    if (type === "finish") return { ...state, phase: "finished" };
    if (type === "choose") {
      const choices = { ...state.choices, [playerId]: action.payload.index };
      if (Object.values(choices).some((c) => c === null)) return { ...state, choices };
      const guesser = state.order.find((id) => id !== state.subject);
      const right = choices[guesser] === choices[state.subject];
      return { ...state, choices, phase: "revealing", scores: right ? { ...state.scores, [guesser]: state.scores[guesser] + 1 } : state.scores };
    }
    const next = { ...state.next, [playerId]: true };
    if (!Object.values(next).every(Boolean)) return { ...state, next };
    const guesser = state.order.find((id) => id !== state.subject);
    const history = [...state.history, { questionId: state.deck[state.round - 1].id, subject: state.subject, right: state.choices[guesser] === state.choices[state.subject] }];
    if (state.round >= state.rounds) return { ...state, history, next, phase: "finished" };
    const reset = (value) => Object.fromEntries(state.order.map((id) => [id, value]));
    return { ...state, history, round: state.round + 1, subject: guesser, choices: reset(null), next: reset(false), phase: "choosing" };
  },

  getResult(state) {
    if (state.phase !== "finished") return null;
    const played = state.history.length;
    const right = state.history.filter((h) => h.right).length;
    const line = played ? `${right} of ${played} predicted right — ${right * 2 >= played ? "you can read each other 🔮" : "still full of surprises 😄"}` : "See you next time ❤️";
    return { outcome: "completed", summary: { headline: "Mind readers? 🔮", line, rounds: played, right } };
  },

  view(state, playerId) {
    const partner = state.order.find((id) => id !== playerId);
    const both = state.order.every((id) => state.choices[id] !== null);
    return {
      rounds: state.rounds,
      round: state.round,
      phase: state.phase,
      subject: state.subject,
      question: state.deck[Math.min(state.round, state.deck.length) - 1] ?? null,
      myChoice: state.choices[playerId],
      partnerChose: state.choices[partner] !== null,
      partnerChoice: both ? state.choices[partner] : null,
      myNext: state.next[playerId],
      partnerNext: state.next[partner],
      scores: state.scores,
    };
  },
};

export default rules;
