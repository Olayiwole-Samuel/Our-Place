import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { DAILY_QUESTIONS } from "@/lib/game/questions/talk";
import { cleanText } from "@/lib/game/text";

/**
 * Daily Question — a conversation game (no winner, no streak). One question a
 * day, the same for both of you all day (picked from the couple and the date
 * in Lagos), answered in your own words. You each answer in secret; the
 * answers are revealed together. Want more? Up to two bonus questions.
 *
 * Actions: answer { text } (1–280 characters)  more {}  finish {}
 * Hidden information: the partner's answer is never in your view until you've both answered.
 */
export const MAX_ANSWER = 280;
export const BONUS = 2;

/** The day in Lagos, "YYYY-MM-DD". */
export function lagosDay(now) {
  return new Date(now + 60 * 60 * 1000).toISOString().slice(0, 10); // Lagos is UTC+1 all year
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Today's question for this couple, then the bonus ones — the same list all day. */
export function questionsFor(coupleId, day, bank = DAILY_QUESTIONS) {
  const start = hash(`${coupleId}:${day}`) % bank.length;
  return Array.from({ length: 1 + BONUS }, (_, i) => bank[(start + i * 7) % bank.length]);
}

const rules = {
  async prepare({ coupleId }) {
    const day = lagosDay(Date.now());
    return { day, questions: questionsFor(coupleId, day).map(({ id, text }) => ({ id, text })) };
  },

  setup({ playerIds, options }) {
    const each = (value) => Object.fromEntries(playerIds.map((id) => [id, value]));
    return { day: options.day, questions: options.questions, index: 0, answers: each(null), phase: "answering", history: [] };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "finish") return null;
    if (type === "answer") {
      if (state.phase !== "answering") return gameError(GAME_ERROR.ILLEGAL_ACTION, "You've both answered this one.");
      if (state.answers[playerId] !== null) return gameError("already_answered", "You've already answered.");
      if (!cleanText(action.payload?.text, MAX_ANSWER)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Write an answer (up to 280 characters).");
      return null;
    }
    if (type === "more") {
      if (state.phase !== "revealing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "Answer this one first.");
      if (state.index >= state.questions.length - 1) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That's all for today — come back tomorrow ❤️");
      return null;
    }
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action) {
    const { type, playerId } = action;
    if (type === "finish") return { ...state, phase: "finished" };
    if (type === "answer") {
      const answers = { ...state.answers, [playerId]: cleanText(action.payload.text, MAX_ANSWER) };
      if (!Object.values(answers).every((a) => a !== null)) return { ...state, answers };
      const history = [...state.history, { questionId: state.questions[state.index].id, answers }];
      return { ...state, answers, history, phase: "revealing" };
    }
    // more
    return { ...state, index: state.index + 1, answers: Object.fromEntries(Object.keys(state.answers).map((id) => [id, null])), phase: "answering" };
  },

  getResult(state) {
    if (state.phase !== "finished") return null;
    const n = state.history.length;
    return { outcome: "completed", summary: { headline: "See you tomorrow ❤️", line: n ? `${n} question${n === 1 ? "" : "s"} answered together today` : "Come back and answer today's question", answered: n, day: state.day } };
  },

  view(state, playerId) {
    const partner = Object.keys(state.answers).find((id) => id !== playerId);
    const both = Object.values(state.answers).every((a) => a !== null);
    return {
      day: state.day,
      index: state.index,
      bonusLeft: state.questions.length - 1 - state.index,
      phase: state.phase,
      question: state.questions[state.index],
      myAnswer: state.answers[playerId],
      partnerAnswered: state.answers[partner] !== null,
      partnerAnswer: both ? state.answers[partner] : null,
    };
  },
};

export default rules;
