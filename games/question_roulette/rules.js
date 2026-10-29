import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Question Roulette (18+) — a conversation game: no winner, no streak. Take
 * turns spinning the wheel; it lands on Flirty 🌸, Spicy 🌶️, Hot 🔥 or a Wild
 * card 🎲, and you answer that question (out loud, in chat, however you like),
 * then tap Answered. Your partner reacts. Then they spin.
 *
 * Where the wheel lands is decided by the server before the game starts
 * (prepare → options.spins), so nobody can steer it, and each round's question
 * is drawn from the server's question provider (lib/game/questions/spicy.js).
 *
 * State: { rounds, round, order, current, phase: "spin"|"answer"|"finished",
 *          spins: [{ segment, level, prompt }], reaction, answered: { [playerId]: n } }
 *
 * Actions: spin {}  answered {}  pass {}  react { emoji }  finish {}
 */
export const DEFAULT_ROUNDS = 10;
/** The wheel, clockwise from the top. */
export const SEGMENTS = Object.freeze(["flirty", "spicy", "hot", "flirty", "wild", "spicy", "hot", "spicy"]);
export const REACTIONS = Object.freeze(["❤️", "🔥", "😳", "😂", "🥵", "😈"]);

const rules = {
  async prepare({ coupleId, options, random, services }) {
    const rounds = Math.min(20, Math.max(2, Number.isInteger(options.rounds) ? options.rounds : DEFAULT_ROUNDS));
    const segments = Array.from({ length: rounds }, () => random.int(0, SEGMENTS.length - 1));
    const need = {};
    for (const segment of segments) need[SEGMENTS[segment]] = (need[SEGMENTS[segment]] ?? 0) + 1;
    const drawn = Object.fromEntries(
      await Promise.all(Object.entries(need).map(async ([level, count]) => [level, await services.questions.draw({ gameId: `question_roulette_${level}`, coupleId, count, random })])),
    );
    const taken = {};
    const spins = segments.map((segment) => {
      const level = SEGMENTS[segment];
      const list = drawn[level];
      const prompt = list[(taken[level] = (taken[level] ?? -1) + 1) % list.length];
      return { segment, level, prompt: { id: prompt.id, text: prompt.text } };
    });
    return { rounds, spins };
  },

  setup({ playerIds, options, random }) {
    return {
      rounds: options.rounds,
      round: 1,
      order: [...playerIds],
      current: playerIds[random.int(0, playerIds.length - 1)],
      phase: "spin",
      spins: options.spins,
      reaction: null,
      answered: Object.fromEntries(playerIds.map((id) => [id, 0])),
      passed: Object.fromEntries(playerIds.map((id) => [id, 0])),
      history: [],
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.phase === "finished") return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "finish") return null;
    if (type === "react") {
      if (state.phase !== "answer" || playerId === state.current) return gameError(GAME_ERROR.ILLEGAL_ACTION, "React while your partner answers.");
      if (!REACTIONS.includes(action.payload?.emoji)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Pick a reaction.");
      return null;
    }
    if (playerId !== state.current) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    if (type === "spin") return state.phase === "spin" ? null : gameError(GAME_ERROR.ILLEGAL_ACTION, "The wheel has already spun.");
    if (type === "answered" || type === "pass") return state.phase === "answer" ? null : gameError(GAME_ERROR.ILLEGAL_ACTION, "Spin first.");
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action) {
    const { type, playerId } = action;
    if (type === "finish") return { ...state, phase: "finished" };
    if (type === "react") return { ...state, reaction: { by: playerId, emoji: action.payload.emoji } };
    if (type === "spin") return { ...state, phase: "answer", reaction: null };
    const spin = state.spins[state.round - 1];
    const pass = type === "pass";
    const history = [...state.history, { by: playerId, level: spin.level, promptId: spin.prompt.id, pass, reaction: state.reaction?.emoji ?? null }];
    const answered = pass ? state.answered : { ...state.answered, [playerId]: state.answered[playerId] + 1 };
    const passed = pass ? { ...state.passed, [playerId]: state.passed[playerId] + 1 } : state.passed;
    if (state.round >= state.rounds) return { ...state, history, answered, passed, phase: "finished" };
    const next = state.order.find((id) => id !== playerId) ?? playerId;
    return { ...state, history, answered, passed, round: state.round + 1, current: next, phase: "spin", reaction: null };
  },

  getResult(state) {
    if (state.phase !== "finished") return null;
    const passes = Object.values(state.passed).reduce((a, b) => a + b, 0);
    const hot = state.history.filter((h) => h.level === "hot" && !h.pass).length;
    const line = state.history.length === 0 ? "See you next time 😉" : `${state.history.length - passes} answered${hot ? `, ${hot} of them hot 🔥` : ""}${passes ? ` · ${passes} passed` : ""}`;
    return { outcome: "completed", summary: { headline: "What a spin 😈", line, turns: state.history.length } };
  },

  /** The wheel's result only once it has spun — never the rounds to come. */
  view(state) {
    const spin = state.spins[state.round - 1];
    const shown = state.phase !== "spin" ? spin : null;
    return {
      rounds: state.rounds,
      round: state.round,
      current: state.current,
      phase: state.phase,
      segment: shown?.segment ?? null,
      level: shown?.level ?? null,
      prompt: shown?.prompt ?? null,
      reaction: state.reaction,
      answered: state.answered,
      passed: state.passed,
      turns: state.history.length,
    };
  },
};

export default rules;
