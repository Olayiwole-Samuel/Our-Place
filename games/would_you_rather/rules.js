import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Would You Rather — a conversation game: no winner, no score, no streak.
 * Pure rules run by the server (lib/game/sessions.server.js).
 *
 * prepare (server, before setup): draws this session's questions from the
 * question provider (curated bank, unseen by this couple first).
 *
 * State (server-only; each player gets view()):
 *   { rounds, round, deck[], answers: { [playerId]: "A"|"B"|null },
 *     next: { [playerId]: bool }, phase: "answering"|"revealing"|"finished",
 *     history: [{ questionId, answers }] }
 *
 * Phases:
 *   answering  → each player answers once (locked). Partners only see THAT the
 *                other answered, never what, until both have.
 *   revealing  → both answers shown together. Each player taps Next; when both
 *                have, the next round starts (or the game finishes after the last).
 *   finished   → result { outcome: "completed" } — no winner.
 * Either player can "finish" early from answering/revealing (still completed).
 *
 * Actions (intent only; the server attaches the verified player):
 *   answer { choice: "A"|"B" }   next {}   finish {}
 */
export const DEFAULT_ROUNDS = 10;
const CHOICES = new Set(["A", "B"]);

const others = (state, playerId) => Object.keys(state.answers).filter((id) => id !== playerId);
/** Rounds where you both chose the same. */
const matchesIn = (history) => history.filter(({ answers }) => new Set(Object.values(answers)).size === 1).length;

/**
 * The same game for more than one question bank: "would_you_rather" and the
 * 18+ "would_you_rather_spicy" (games/would_you_rather_spicy/rules.js).
 */
export function createWouldYouRatherRules(gameId, { headline = "That was fun ❤️" } = {}) {
  return {
    async prepare({ coupleId, options, random, services }) {
      const rounds = Math.min(30, Math.max(1, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
      const questions = await services.questions.draw({ gameId, coupleId, count: rounds, random });
      return { rounds: Math.min(rounds, questions.length), questions };
    },

    setup({ playerIds, options }) {
      const deck = options.questions.map(({ id, optionA, optionB, category }) => ({ id, optionA, optionB, ...(category ? { category } : {}) }));
      return {
        rounds: options.rounds,
        round: 1,
        deck,
        answers: Object.fromEntries(playerIds.map((id) => [id, null])),
        next: Object.fromEntries(playerIds.map((id) => [id, false])),
        phase: "answering",
        history: [],
      };
    },

    validate(state, action) {
      const { type, playerId } = action;
      if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
      if (type === "answer") {
        if (state.phase !== "answering") return gameError("round_over", "This round has already been revealed.");
        if (!CHOICES.has(action.payload?.choice)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Choose A or B.");
        if (state.answers[playerId] !== null) return gameError("already_answered", "You've already answered.");
        return null;
      }
      if (type === "next") {
        if (state.phase !== "revealing") return gameError("not_revealed", "Both answers aren't in yet.");
        if (state.next[playerId]) return gameError("already_ready", "Waiting for your partner.");
        return null;
      }
      if (type === "finish") return null;
      return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    },

    apply(state, action) {
      const { type, playerId } = action;
      if (type === "finish") return { ...state, phase: "finished" };

      if (type === "answer") {
        const answers = { ...state.answers, [playerId]: action.payload.choice };
        const everyone = Object.values(answers).every(Boolean);
        return { ...state, answers, phase: everyone ? "revealing" : "answering" };
      }

      // next
      const next = { ...state.next, [playerId]: true };
      if (!Object.values(next).every(Boolean)) return { ...state, next };
      const history = [...state.history, { questionId: state.deck[state.round - 1].id, answers: state.answers }];
      if (state.round >= state.rounds) return { ...state, next, history, phase: "finished" };
      const reset = (value) => Object.fromEntries(Object.keys(state.answers).map((id) => [id, value]));
      return { ...state, round: state.round + 1, answers: reset(null), next: reset(false), history, phase: "answering" };
    },

    getResult(state) {
      if (state.phase !== "finished") return null;
      const played = state.history.length;
      const agreed = matchesIn(state.history);
      const mood = played === 0 ? "See you next time ❤️" : `You agreed on ${agreed} of ${played} — ${agreed * 2 >= played ? "you think alike ❤️" : "opposites attract 👀"}`;
      return { outcome: "completed", summary: { headline, line: mood, rounds: played, agreed } };
    },

    /** What one player may see: never the partner's answer before the reveal, never future questions. */
    view(state, playerId) {
      const partner = others(state, playerId)[0];
      const question = state.deck[Math.min(state.round, state.deck.length) - 1] ?? null;
      // Answers are revealed together — never one before the other, even if the
      // game is finished early while only one person has answered.
      const everyoneAnswered = Object.values(state.answers).every((answer) => answer !== null);
      const revealed = state.phase === "revealing" || (state.phase === "finished" && everyoneAnswered);
      return {
        round: state.round,
        rounds: state.rounds,
        phase: state.phase,
        question,
        myAnswer: state.answers[playerId] ?? null,
        partnerAnswered: state.answers[partner] !== null && state.answers[partner] !== undefined,
        partnerAnswer: revealed ? (state.answers[partner] ?? null) : null,
        myNext: Boolean(state.next[playerId]),
        partnerNext: Boolean(state.next[partner]),
        roundsPlayed: state.history.length,
        matches: matchesIn(state.history),
      };
    },
  };
}

export default createWouldYouRatherRules("would_you_rather");
