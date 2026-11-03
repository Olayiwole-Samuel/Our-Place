import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { cleanText } from "@/lib/game/text";

/**
 * "Write in secret, reveal together" — the conversation games where you both
 * type an answer to a prompt and see them side by side. Pure rules run by the
 * server; prompts come from its question provider. Never a winner, never streaks.
 *
 *   mode "hearts"  (Finish the Sentence) tap ❤️ on your partner's answer
 *   mode "match"   (Couple Trivia) either of you marks whether you matched
 *   mode "subject" (How Well Do You Know Me) rounds alternate: the subject
 *                  writes the true answer about themselves, the other guesses;
 *                  the subject says if they got it — the guesser scores a point
 *
 * Hidden information: your partner's answer is never in your view until you've
 * both answered.
 *
 * Actions: answer { text } (1–160)  heart {}  match { same }  next {}  finish {}
 */
export const MAX_ANSWER = 160;

export function createRevealRules({ gameId, mode, defaultRounds, headline }) {
  return {
    async prepare({ coupleId, options, random, services }) {
      const rounds = Math.min(20, Math.max(2, Number.isInteger(options.rounds) ? options.rounds : defaultRounds));
      const prompts = await services.questions.draw({ gameId, coupleId, count: rounds, random });
      return { rounds: Math.min(rounds, prompts.length), prompts: prompts.map(({ id, text }) => ({ id, text })) };
    },

    setup({ playerIds, options, random }) {
      const each = (value) => Object.fromEntries(playerIds.map((id) => [id, value]));
      return {
        mode,
        rounds: options.rounds,
        round: 1,
        order: [...playerIds],
        deck: options.prompts,
        subject: mode === "subject" ? playerIds[random.int(0, playerIds.length - 1)] : null,
        answers: each(null),
        next: each(false),
        hearts: each(false), // this round: who has hearted their partner's answer
        verdict: null, // this round: true / false once marked
        phase: "answering",
        scores: each(0), // hearts received, or points as the guesser
        matched: 0,
        history: [],
      };
    },

    validate(state, action) {
      const { type, playerId } = action;
      if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
      if (type === "finish") return null;
      if (type === "answer") {
        if (state.phase !== "answering") return gameError(GAME_ERROR.ILLEGAL_ACTION, "This round has been revealed.");
        if (state.answers[playerId] !== null) return gameError("already_answered", "You've already answered.");
        if (!cleanText(action.payload?.text, MAX_ANSWER)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Write an answer (up to 160 characters).");
        return null;
      }
      if (state.phase !== "revealing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "Both answers aren't in yet.");
      if (type === "heart") {
        if (mode !== "hearts") return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
        return state.hearts[playerId] ? gameError("already_hearted", "You've already sent a heart.") : null;
      }
      if (type === "match") {
        if (mode === "hearts") return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
        if (mode === "subject" && playerId !== state.subject) return gameError(GAME_ERROR.NOT_YOUR_TURN, "Your partner says if you got it.");
        if (typeof action.payload?.same !== "boolean") return gameError(GAME_ERROR.MALFORMED_ACTION, "Did it match or not?");
        return state.verdict !== null ? gameError("already_marked", "Already marked.") : null;
      }
      if (type === "next") {
        if (mode !== "hearts" && state.verdict === null) return gameError(GAME_ERROR.ILLEGAL_ACTION, mode === "subject" ? "Waiting to hear if it's right." : "Mark whether you matched first.");
        return state.next[playerId] ? gameError("already_ready", "Waiting for your partner.") : null;
      }
      return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    },

    apply(state, action) {
      const { type, playerId } = action;
      if (type === "finish") return { ...state, phase: "finished" };
      if (type === "answer") {
        const answers = { ...state.answers, [playerId]: cleanText(action.payload.text, MAX_ANSWER) };
        return { ...state, answers, phase: Object.values(answers).every((a) => a !== null) ? "revealing" : "answering" };
      }
      if (type === "heart") {
        const partner = state.order.find((id) => id !== playerId);
        return { ...state, hearts: { ...state.hearts, [playerId]: true }, scores: { ...state.scores, [partner]: state.scores[partner] + 1 } };
      }
      if (type === "match") {
        const same = action.payload.same;
        const guesser = state.order.find((id) => id !== state.subject);
        return {
          ...state,
          verdict: same,
          matched: state.matched + (same ? 1 : 0),
          scores: mode === "subject" && same ? { ...state.scores, [guesser]: state.scores[guesser] + 1 } : state.scores,
        };
      }
      // next
      const next = { ...state.next, [playerId]: true };
      if (!Object.values(next).every(Boolean)) return { ...state, next };
      const history = [...state.history, { promptId: state.deck[state.round - 1].id, verdict: state.verdict }];
      if (state.round >= state.rounds) return { ...state, next, history, phase: "finished" };
      const reset = (value) => Object.fromEntries(state.order.map((id) => [id, value]));
      return {
        ...state,
        history,
        round: state.round + 1,
        answers: reset(null),
        next: reset(false),
        hearts: reset(false),
        verdict: null,
        phase: "answering",
        subject: mode === "subject" ? state.order.find((id) => id !== state.subject) : null,
      };
    },

    getResult(state) {
      if (state.phase !== "finished") return null;
      const played = state.history.length;
      const total = Object.values(state.scores).reduce((a, b) => a + b, 0);
      let line = "See you next time ❤️";
      if (played && mode === "hearts") line = `${played} sentences finished · ${total} heart${total === 1 ? "" : "s"} sent ❤️`;
      else if (played && mode === "match") line = `You matched on ${state.matched} of ${played} — ${state.matched * 2 >= played ? "you remember it all 💞" : "time to make new memories 😄"}`;
      else if (played) line = `${state.matched} of ${played} guessed right — ${state.matched * 2 >= played ? "you really know each other 💞" : "more late-night talks needed 😄"}`;
      return { outcome: "completed", summary: { headline, line, rounds: played, matched: state.matched } };
    },

    view(state, playerId) {
      const partner = state.order.find((id) => id !== playerId);
      const both = state.order.every((id) => state.answers[id] !== null);
      return {
        mode,
        rounds: state.rounds,
        round: state.round,
        phase: state.phase,
        prompt: state.deck[Math.min(state.round, state.deck.length) - 1] ?? null,
        subject: state.subject,
        myAnswer: state.answers[playerId],
        partnerAnswered: state.answers[partner] !== null,
        partnerAnswer: both ? state.answers[partner] : null,
        myHeart: state.hearts[playerId],
        partnerHeart: state.hearts[partner],
        verdict: state.verdict,
        myNext: state.next[playerId],
        partnerNext: state.next[partner],
        scores: state.scores,
        matched: state.matched,
        played: state.history.length,
      };
    },
  };
}
