import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * This or That — a conversation game (no winner, no streak): quick picks. You
 * both tap one of two in secret; as soon as you've both picked, the next pair
 * appears and the last one is revealed (did you match?). 12 pairs by default.
 * Pure rules run by the server; pairs come from the question provider
 * (lib/game/questions/talk.js).
 *
 * Actions: pick { choice: "A"|"B" }  finish {}
 * Hidden information: never the partner's pick for the current pair.
 */
export const DEFAULT_ROUNDS = 12;
const CHOICES = new Set(["A", "B"]);

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const rounds = Math.min(30, Math.max(1, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
    const pairs = await services.questions.draw({ gameId: "this_or_that", coupleId, count: rounds, random });
    return { rounds: Math.min(rounds, pairs.length), pairs };
  },

  setup({ playerIds, options }) {
    return {
      rounds: options.rounds,
      round: 1,
      deck: options.pairs.map(({ id, optionA, optionB }) => ({ id, optionA, optionB })),
      picks: Object.fromEntries(playerIds.map((id) => [id, null])),
      history: [],
      finished: false,
    };
  },

  validate(state, action) {
    if (state.finished) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (action.type === "finish") return null;
    if (action.type !== "pick") return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    if (!CHOICES.has(action.payload?.choice)) return gameError(GAME_ERROR.MALFORMED_ACTION, "This or that?");
    if (state.picks[action.playerId] !== null) return gameError("already_answered", "You've picked — waiting for your partner.");
    return null;
  },

  apply(state, action) {
    if (action.type === "finish") return { ...state, finished: true };
    const picks = { ...state.picks, [action.playerId]: action.payload.choice };
    if (!Object.values(picks).every(Boolean)) return { ...state, picks };
    const history = [...state.history, { pair: state.deck[state.round - 1], picks }];
    if (state.round >= state.rounds) return { ...state, picks, history, finished: true };
    return { ...state, round: state.round + 1, picks: Object.fromEntries(Object.keys(picks).map((id) => [id, null])), history };
  },

  getResult(state) {
    if (!state.finished) return null;
    const played = state.history.length;
    const matched = state.history.filter((h) => new Set(Object.values(h.picks)).size === 1).length;
    const percent = played ? Math.round((matched / played) * 100) : 0;
    const line = played ? `${percent}% the same — ${percent >= 70 ? "soulmates 💞" : percent >= 40 ? "a perfect mix ❤️" : "opposites attract 😄"}` : "See you next time ❤️";
    return { outcome: "completed", summary: { headline: "Quick picks done ⚡", line, rounds: played, matched } };
  },

  view(state, playerId) {
    const partner = Object.keys(state.picks).find((id) => id !== playerId);
    const last = state.history.at(-1) ?? null;
    return {
      round: state.round,
      rounds: state.rounds,
      finished: state.finished,
      pair: state.deck[state.round - 1],
      myPick: state.picks[playerId],
      partnerPicked: state.picks[partner] !== null,
      // The pair you've both just picked — shown as the reveal while the next one appears.
      last: last ? { pair: last.pair, mine: last.picks[playerId], theirs: last.picks[partner], number: state.history.length } : null,
      matched: state.history.filter((h) => new Set(Object.values(h.picks)).size === 1).length,
      played: state.history.length,
    };
  },
};

export default rules;
