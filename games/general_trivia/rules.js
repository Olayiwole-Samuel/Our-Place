import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * General Trivia — race to the right answer. Ten multiple-choice questions, the
 * same for both of you; 15 seconds each. A right answer scores 10, and whoever
 * got it right first scores 5 more. Most points wins (equal is a draw).
 *
 * Pure rules run by the server, on its own clock (ctx.now): when you answered,
 * and whether time is up, are the server's to say. Hidden information: the right
 * answer and your partner's choice are never in your view until the reveal.
 *
 * Actions: answer { index }  time_up {} (either screen, once the clock has run out)  next {}  resign {}
 */
export const DEFAULT_ROUNDS = 10;
export const QUESTION_MS = 15_000;
export const POINTS = 10;
export const FIRST_BONUS = 5;

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const rounds = Math.min(30, Math.max(2, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
    const drawn = await services.questions.draw({ gameId: "general_trivia", coupleId, count: rounds, random });
    // Shuffle each question's options (the bank lists the right one first).
    const questions = drawn.map(({ id, text, options: choices, answer }) => {
      const order = random.shuffle(choices.map((_, i) => i));
      return { id, text, options: order.map((i) => choices[i]), answer: order.indexOf(answer) };
    });
    return { rounds: Math.min(rounds, questions.length), questions };
  },

  setup({ playerIds, options, now }) {
    const each = (value) => Object.fromEntries(playerIds.map((id) => [id, value]));
    return {
      rounds: options.rounds,
      round: 1,
      order: [...playerIds],
      deck: options.questions,
      answers: each(null), // { index, at }
      deadline: now + QUESTION_MS,
      phase: "question",
      scores: each(0),
      gained: each(0), // points from the last question
      resigned: null,
      over: false,
    };
  },

  validate(state, action, ctx) {
    const { type, playerId } = action;
    if (state.over) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "resign") return null;
    if (type === "answer") {
      if (state.phase !== "question") return gameError("already_revealed", "This question is over.");
      if (state.answers[playerId]) return gameError("already_answered", "You've already answered.");
      if (ctx.now > state.deadline + 1000) return gameError("already_timed_out", "Time's up.");
      const { index } = action.payload ?? {};
      if (!Number.isInteger(index) || index < 0 || index >= state.deck[state.round - 1].options.length) return gameError(GAME_ERROR.MALFORMED_ACTION, "Pick one of the answers.");
      return null;
    }
    if (type === "time_up") {
      if (state.phase !== "question" || ctx.now < state.deadline - 500) return gameError("already_not_yet", "Not yet.");
      return null;
    }
    if (type === "next") return state.phase === "reveal" ? null : gameError("already_moved_on", "Already on the next one.");
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action, ctx) {
    const { type, playerId } = action;
    if (type === "resign") return { ...state, over: true, resigned: playerId };
    if (type === "next") {
      if (state.round >= state.rounds) return { ...state, over: true };
      const reset = Object.fromEntries(state.order.map((id) => [id, null]));
      return { ...state, round: state.round + 1, answers: reset, deadline: ctx.now + QUESTION_MS, phase: "question" };
    }
    const answers = type === "answer" ? { ...state.answers, [playerId]: { index: action.payload.index, at: ctx.now } } : state.answers;
    if (type === "answer" && !state.order.every((id) => answers[id])) return { ...state, answers };
    // Everyone has answered (or time is up): score it.
    const { answer } = state.deck[state.round - 1];
    const rightOnes = state.order.filter((id) => answers[id]?.index === answer).sort((a, b) => answers[a].at - answers[b].at);
    const gained = Object.fromEntries(state.order.map((id) => [id, rightOnes.includes(id) ? POINTS + (rightOnes[0] === id ? FIRST_BONUS : 0) : 0]));
    const scores = Object.fromEntries(state.order.map((id) => [id, state.scores[id] + gained[id]]));
    return { ...state, answers, gained, scores, phase: "reveal" };
  },

  getResult(state) {
    if (!state.over) return null;
    const [a, b] = state.order;
    const { scores } = state;
    if (state.resigned) return { outcome: "win", winnerId: state.order.find((id) => id !== state.resigned), scores, summary: { resigned: state.resigned } };
    if (scores[a] === scores[b]) return { outcome: "draw", scores };
    return { outcome: "win", winnerId: scores[a] > scores[b] ? a : b, scores };
  },

  view(state, playerId) {
    const partner = state.order.find((id) => id !== playerId);
    const question = state.deck[Math.min(state.round, state.deck.length) - 1];
    const revealed = state.phase === "reveal" || state.over;
    return {
      rounds: state.rounds,
      round: state.round,
      phase: state.phase,
      deadline: state.deadline,
      question: { id: question.id, text: question.text, options: question.options },
      answer: revealed ? question.answer : null,
      myAnswer: state.answers[playerId]?.index ?? null,
      partnerAnswered: Boolean(state.answers[partner]),
      partnerAnswer: revealed ? (state.answers[partner]?.index ?? null) : null,
      gained: revealed ? state.gained : null,
      scores: state.scores,
    };
  },
};

export default rules;
