import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Never Have I Ever — a conversation game: no winner, no streak. You each start
 * with ten fingers up. Each round shows a statement; you both answer in secret
 * — "I have" 🙋 (a finger goes down) or "Never" 🙅 — and the answers are
 * revealed together. Talk about it, tap Next. The game ends after the last
 * round, or when one of you runs out of fingers.
 *
 * Statements come from the server's question provider (lib/game/questions/neverHaveIEver.js).
 * Actions: answer { choice: "have"|"never" }  next {}  finish {}
 */
export const DEFAULT_ROUNDS = 15;
export const FINGERS = 10;
const CHOICES = new Set(["have", "never"]);

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const rounds = Math.min(30, Math.max(1, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
    const statements = await services.questions.draw({ gameId: "never_have_i_ever", coupleId, count: rounds, random });
    return { rounds: Math.min(rounds, statements.length), statements };
  },

  setup({ playerIds, options }) {
    const each = (value) => Object.fromEntries(playerIds.map((id) => [id, value]));
    return {
      rounds: options.rounds,
      round: 1,
      deck: options.statements.map(({ id, text }) => ({ id, text })),
      answers: each(null),
      next: each(false),
      fingers: each(FINGERS),
      phase: "answering",
      history: [],
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "finish") return null;
    if (type === "answer") {
      if (state.phase !== "answering") return gameError("round_over", "This round has already been revealed.");
      if (!CHOICES.has(action.payload?.choice)) return gameError(GAME_ERROR.MALFORMED_ACTION, "I have, or never?");
      if (state.answers[playerId] !== null) return gameError("already_answered", "You've already answered.");
      return null;
    }
    if (type === "next") {
      if (state.phase !== "revealing") return gameError("not_revealed", "Both answers aren't in yet.");
      if (state.next[playerId]) return gameError("already_ready", "Waiting for your partner.");
      return null;
    }
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action) {
    const { type, playerId } = action;
    if (type === "finish") return { ...state, phase: "finished" };
    if (type === "answer") {
      const answers = { ...state.answers, [playerId]: action.payload.choice };
      if (!Object.values(answers).every(Boolean)) return { ...state, answers };
      const fingers = Object.fromEntries(Object.entries(state.fingers).map(([id, n]) => [id, answers[id] === "have" ? Math.max(0, n - 1) : n]));
      return { ...state, answers, fingers, phase: "revealing" };
    }
    const next = { ...state.next, [playerId]: true };
    if (!Object.values(next).every(Boolean)) return { ...state, next };
    const history = [...state.history, { statementId: state.deck[state.round - 1].id, answers: state.answers }];
    const outOfFingers = Object.values(state.fingers).some((n) => n === 0);
    if (state.round >= state.rounds || outOfFingers) return { ...state, next, history, phase: "finished" };
    const reset = (value) => Object.fromEntries(Object.keys(state.answers).map((id) => [id, value]));
    return { ...state, round: state.round + 1, answers: reset(null), next: reset(false), history, phase: "answering" };
  },

  getResult(state) {
    if (state.phase !== "finished") return null;
    const played = state.history.length;
    const both = state.history.filter(({ answers }) => Object.values(answers).every((a) => a === "have")).length;
    const line = played === 0 ? "See you next time ❤️" : `${played} confessions · you'd both done ${both} of them 🙈`;
    return { outcome: "completed", summary: { headline: "Secrets out 🙊", line, rounds: played, both } };
  },

  /** Never the partner's answer before you've both answered. */
  view(state, playerId) {
    const partner = Object.keys(state.answers).find((id) => id !== playerId);
    const everyone = Object.values(state.answers).every((a) => a !== null);
    const revealed = state.phase === "revealing" || (state.phase === "finished" && everyone);
    return {
      round: state.round,
      rounds: state.rounds,
      phase: state.phase,
      statement: state.deck[Math.min(state.round, state.deck.length) - 1] ?? null,
      myAnswer: state.answers[playerId] ?? null,
      partnerAnswered: state.answers[partner] !== null && state.answers[partner] !== undefined,
      partnerAnswer: revealed ? (state.answers[partner] ?? null) : null,
      myNext: Boolean(state.next[playerId]),
      partnerNext: Boolean(state.next[partner]),
      fingers: state.fingers,
    };
  },
};

export default rules;
