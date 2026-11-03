import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { cleanText } from "@/lib/game/text";

/**
 * Category Blitz — name as many as you can before time runs out. Three
 * categories, 45 seconds each. You type your answers in secret (your partner only
 * sees how many). When time's up, the lists are revealed: strike out any of your
 * partner's that don't count, and when you're both happy, on to the next. Each
 * answer left standing is a point. Most points wins (equal is a draw).
 *
 * Pure rules run by the server, on its own clock (ctx.now).
 *
 * Actions: add { word }  time_up {}  strike { index }  done {}  resign {}
 */
export const DEFAULT_ROUNDS = 3;
export const ROUND_MS = 45_000;
export const MAX_WORD = 40;
export const MAX_WORDS = 40;

const key = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const standing = (list) => list.filter((entry) => !entry.struck).length;

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const rounds = Math.min(6, Math.max(1, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
    const categories = await services.questions.draw({ gameId: "category_blitz", coupleId, count: rounds, random });
    return { rounds: Math.min(rounds, categories.length), categories: categories.map(({ id, text }) => ({ id, text })) };
  },

  setup({ playerIds, options, now }) {
    const each = (make) => Object.fromEntries(playerIds.map((id) => [id, make()]));
    return {
      rounds: options.rounds,
      round: 1,
      order: [...playerIds],
      categories: options.categories,
      words: each(() => []), // this round: [{ word, struck }]
      done: each(() => false),
      deadline: now + ROUND_MS,
      phase: "playing",
      scores: each(() => 0),
      resigned: null,
      over: false,
    };
  },

  validate(state, action, ctx) {
    const { type, playerId } = action;
    if (state.over) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "resign") return null;
    if (type === "add") {
      if (state.phase !== "playing") return gameError("already_time_up", "Time's up!");
      if (ctx.now > state.deadline + 1000) return gameError("already_time_up", "Time's up!");
      const word = cleanText(action.payload?.word, MAX_WORD);
      if (!word || !key(word)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Type an answer.");
      const mine = state.words[playerId];
      if (mine.length >= MAX_WORDS) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That's plenty for one round!");
      if (mine.some((entry) => key(entry.word) === key(word))) return gameError(GAME_ERROR.ILLEGAL_ACTION, "You've already got that one.");
      return null;
    }
    if (type === "time_up") {
      if (state.phase !== "playing" || ctx.now < state.deadline - 500) return gameError("already_not_yet", "Not yet.");
      return null;
    }
    if (state.phase !== "review") return gameError("already_playing", "Still playing.");
    if (type === "strike") {
      const partner = state.order.find((id) => id !== playerId);
      const { index } = action.payload ?? {};
      if (!Number.isInteger(index) || !state.words[partner][index]) return gameError(GAME_ERROR.MALFORMED_ACTION, "That answer isn't there.");
      return state.done[playerId] ? gameError(GAME_ERROR.ILLEGAL_ACTION, "You've already said you're done.") : null;
    }
    if (type === "done") return state.done[playerId] ? gameError("already_ready", "Waiting for your partner.") : null;
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action, ctx) {
    const { type, playerId } = action;
    if (type === "resign") return { ...state, over: true, resigned: playerId };
    if (type === "add") {
      return { ...state, words: { ...state.words, [playerId]: [...state.words[playerId], { word: cleanText(action.payload.word, MAX_WORD), struck: false }] } };
    }
    if (type === "time_up") return { ...state, phase: "review" };
    if (type === "strike") {
      const partner = state.order.find((id) => id !== playerId);
      const list = state.words[partner].map((entry, i) => (i === action.payload.index ? { ...entry, struck: !entry.struck } : entry));
      return { ...state, words: { ...state.words, [partner]: list } };
    }
    // done
    const done = { ...state.done, [playerId]: true };
    if (!Object.values(done).every(Boolean)) return { ...state, done };
    const scores = Object.fromEntries(state.order.map((id) => [id, state.scores[id] + standing(state.words[id])]));
    if (state.round >= state.rounds) return { ...state, done, scores, over: true };
    return {
      ...state,
      scores,
      round: state.round + 1,
      words: Object.fromEntries(state.order.map((id) => [id, []])),
      done: Object.fromEntries(state.order.map((id) => [id, false])),
      deadline: ctx.now + ROUND_MS,
      phase: "playing",
    };
  },

  getResult(state) {
    if (!state.over) return null;
    const [a, b] = state.order;
    const { scores } = state;
    if (state.resigned) return { outcome: "win", winnerId: state.order.find((id) => id !== state.resigned), scores, summary: { resigned: state.resigned } };
    if (scores[a] === scores[b]) return { outcome: "draw", scores };
    return { outcome: "win", winnerId: scores[a] > scores[b] ? a : b, scores };
  },

  /** While playing, your partner's list is only a count. */
  view(state, playerId) {
    const partner = state.order.find((id) => id !== playerId);
    const open = state.phase === "review" || state.over;
    return {
      rounds: state.rounds,
      round: state.round,
      phase: state.phase,
      deadline: state.deadline,
      category: state.categories[Math.min(state.round, state.categories.length) - 1],
      mine: state.words[playerId],
      theirs: open ? state.words[partner] : null,
      theirCount: state.words[partner].length,
      myDone: state.done[playerId],
      partnerDone: state.done[partner],
      scores: state.scores,
    };
  },
};

export default rules;
