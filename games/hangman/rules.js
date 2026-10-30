import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Hangman — you set a secret word (or short phrase) for each other. Rounds
 * alternate: one of you sets, the other guesses letter by letter (or solves the
 * whole thing). Six misses and the guesser is hanged. Pure rules run by the
 * server; hidden information: the guesser's view has only the letters found
 * so far, never the word, until the round is over.
 *
 * Scoring per round: solved → the guesser scores 7 − misses (a clean solve is 7);
 * hanged → the setter scores 3. Most points after all rounds wins (equal: draw).
 *
 * Actions:
 *   set { word, hint? }    setter, phase "setting" — letters and single spaces, 3–20 long; hint ≤ 40
 *   guess { letter }       guesser, phase "guessing"
 *   solve { word }         guesser, phase "guessing" — wrong counts as a miss
 *   next {}                either, phase "reveal" — on to the next round
 *   finish {}              either — ends early; the higher score so far wins
 */
export const MAX_MISSES = 6;
export const DEFAULT_ROUNDS = 4;
const WORD = /^[a-z]+( [a-z]+)*$/;
const CONTROL = /[\u0000-\u001F\u007F<>]/;

export function cleanWord(raw) {
  if (typeof raw !== "string") return null;
  const word = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (word.length > 20 || !WORD.test(word) || word.replace(/ /g, "").length < 3) return null;
  return word;
}

const lettersOf = (word) => new Set(word.replace(/ /g, ""));
const solvedBy = (word, guessed) => [...lettersOf(word)].every((l) => guessed.includes(l));

const rules = {
  setup({ playerIds, random, options }) {
    const first = playerIds[random.int(0, playerIds.length - 1)];
    return {
      rounds: Number.isInteger(options?.rounds) ? Math.min(10, Math.max(2, options.rounds)) : DEFAULT_ROUNDS,
      round: 1,
      order: [...playerIds],
      setter: first,
      phase: "setting",
      word: null,
      hint: null,
      guessed: [],
      misses: 0,
      solved: false,
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      history: [],
      finished: false,
    };
  },

  validate(state, action) {
    const { type, playerId } = action;
    if (state.finished) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (type === "finish") return null;
    const guesser = state.order.find((id) => id !== state.setter);
    if (type === "set") {
      if (state.phase !== "setting") return gameError(GAME_ERROR.ILLEGAL_ACTION, "The word is already set.");
      if (playerId !== state.setter) return gameError(GAME_ERROR.NOT_YOUR_TURN, "Your partner is choosing the word.");
      if (!cleanWord(action.payload?.word)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Use letters only (spaces between words are fine), 3 to 20 long.");
      const hint = action.payload?.hint;
      if (hint !== undefined && hint !== null && (typeof hint !== "string" || hint.length > 40 || CONTROL.test(hint))) return gameError(GAME_ERROR.MALFORMED_ACTION, "Keep the hint short.");
      return null;
    }
    if (type === "guess" || type === "solve") {
      if (state.phase !== "guessing") return gameError(GAME_ERROR.ILLEGAL_ACTION, "Not time to guess.");
      if (playerId !== guesser) return gameError(GAME_ERROR.NOT_YOUR_TURN, "Your partner is guessing this one.");
      if (type === "guess") {
        const letter = action.payload?.letter;
        if (typeof letter !== "string" || !/^[a-z]$/.test(letter)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Pick a letter.");
        if (state.guessed.includes(letter)) return gameError(GAME_ERROR.ILLEGAL_ACTION, "You've tried that letter.");
      } else if (!cleanWord(action.payload?.word)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Type the whole word.");
      return null;
    }
    if (type === "next") return state.phase === "reveal" ? null : gameError(GAME_ERROR.ILLEGAL_ACTION, "The round isn't over.");
    return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
  },

  apply(state, action) {
    const { type, playerId } = action;
    if (type === "finish") return { ...state, finished: true };
    if (type === "set") {
      const hint = typeof action.payload.hint === "string" ? action.payload.hint.replace(/\s+/g, " ").trim() || null : null;
      return { ...state, phase: "guessing", word: cleanWord(action.payload.word), hint, guessed: [], misses: 0, solved: false };
    }
    if (type === "next") {
      if (state.round >= state.rounds) return { ...state, finished: true };
      return { ...state, round: state.round + 1, setter: state.order.find((id) => id !== state.setter), phase: "setting", word: null, hint: null, guessed: [], misses: 0, solved: false };
    }
    let { guessed, misses } = state;
    let solved = false;
    if (type === "guess") {
      guessed = [...guessed, action.payload.letter];
      if (!state.word.includes(action.payload.letter)) misses += 1;
      solved = solvedBy(state.word, guessed);
    } else if (cleanWord(action.payload.word) === state.word) {
      solved = true;
      guessed = [...new Set([...guessed, ...lettersOf(state.word)])];
    } else misses += 1;
    const over = solved || misses >= MAX_MISSES;
    if (!over) return { ...state, guessed, misses };
    const scores = { ...state.scores };
    if (solved) scores[playerId] += MAX_MISSES + 1 - misses;
    else scores[state.setter] += 3;
    const history = [...state.history, { setter: state.setter, word: state.word, solved, misses }];
    return { ...state, guessed, misses, solved, scores, history, phase: "reveal" };
  },

  getResult(state) {
    if (!state.finished) return null;
    const [a, b] = state.order;
    const scores = { ...state.scores };
    if (scores[a] === scores[b]) return { outcome: "draw", scores };
    return { outcome: "win", winnerId: scores[a] > scores[b] ? a : b, scores };
  },

  view(state, playerId) {
    const setter = playerId === state.setter;
    const reveal = setter || state.phase === "reveal" || state.finished;
    const word = state.word;
    return {
      rounds: state.rounds,
      round: state.round,
      phase: state.phase,
      setter: state.setter,
      hint: state.hint,
      // The guesser sees found letters only; "_" for the rest, spaces as they are.
      pattern: word ? [...word].map((ch) => (ch === " " ? " " : reveal || state.guessed.includes(ch) ? ch : "_")) : null,
      word: reveal ? word : null,
      guessed: state.guessed,
      wrong: word ? state.guessed.filter((l) => !word.includes(l)) : [],
      misses: state.misses,
      maxMisses: MAX_MISSES,
      solved: state.solved,
      scores: state.scores,
      history: state.history.map((h) => ({ setter: h.setter, solved: h.solved, misses: h.misses, word: h.word })),
    };
  },
};

export default rules;
