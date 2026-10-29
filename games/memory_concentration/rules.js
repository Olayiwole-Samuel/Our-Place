import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Memory (Concentration) — 12 pairs face down, shuffled by the server. On your
 * turn flip two cards: a pair is yours and you go again; no pair and both stay
 * face up for a moment (until the next flip), then it's your partner's turn.
 * Most pairs when the last one is found wins; equal is a draw.
 *
 * Hidden information: a player's view only ever contains the faces of cards
 * that are face up (being flipped, just missed, or already matched).
 *
 * Actions: flip { index }
 * State: { faces: string[24], owner: (playerId|null)[24], open: number[], missed: number[],
 *          current, order, pairs: { [playerId]: n }, flips, lastMatch }
 */
export const FACES = ["💋", "🌹", "🍫", "🐶", "🍿", "🌙", "🔥", "🎮", "🏠", "✈️", "💍", "🍕", "🧸", "🎶", "🌴", "🍷"];
export const PAIRS = 12;

const rules = {
  setup({ playerIds, random }) {
    const faces = random.shuffle(random.shuffle([...FACES]).slice(0, PAIRS).flatMap((face) => [face, face]));
    return {
      faces,
      owner: Array(faces.length).fill(null),
      open: [],
      missed: [],
      order: [...playerIds],
      current: playerIds[random.int(0, playerIds.length - 1)],
      pairs: Object.fromEntries(playerIds.map((id) => [id, 0])),
      flips: 0,
      lastMatch: null,
    };
  },

  validate(state, action) {
    if (action.type !== "flip") return gameError(GAME_ERROR.MALFORMED_ACTION, "That move wasn't understood.");
    const index = action.payload?.index;
    if (!Number.isInteger(index) || index < 0 || index >= state.faces.length) return gameError(GAME_ERROR.MALFORMED_ACTION, "That card doesn't exist.");
    if (state.owner.every(Boolean)) return gameError(GAME_ERROR.SESSION_NOT_ACTIVE, "This game has finished.");
    if (state.current !== action.playerId) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    if (state.owner[index] || state.open.includes(index)) return gameError(GAME_ERROR.ILLEGAL_ACTION, "That card is already face up.");
    return null;
  },

  apply(state, action) {
    const { index } = action.payload;
    const flips = state.flips + 1;
    if (state.open.length === 0) return { ...state, open: [index], missed: [], flips, lastMatch: null };

    const [first] = state.open;
    if (state.faces[first] === state.faces[index]) {
      const owner = [...state.owner];
      owner[first] = owner[index] = action.playerId;
      const pairs = { ...state.pairs, [action.playerId]: state.pairs[action.playerId] + 1 };
      return { ...state, owner, pairs, open: [], missed: [], flips, lastMatch: [first, index] }; // a pair: go again
    }
    const next = state.order.find((id) => id !== action.playerId) ?? action.playerId;
    return { ...state, open: [], missed: [first, index], current: next, flips, lastMatch: null };
  },

  getResult(state) {
    if (!state.owner.every(Boolean)) return null;
    const [a, b] = state.order;
    const scores = { ...state.pairs };
    if (state.pairs[a] === state.pairs[b]) return { outcome: "draw", scores };
    return { outcome: "win", winnerId: state.pairs[a] > state.pairs[b] ? a : b, scores };
  },

  view(state) {
    const shown = new Set([...state.open, ...state.missed]);
    return {
      cards: state.faces.map((face, index) => ({ face: state.owner[index] || shown.has(index) ? face : null, owner: state.owner[index] })),
      open: state.open,
      missed: state.missed,
      current: state.current,
      pairs: state.pairs,
      flips: state.flips,
      lastMatch: state.lastMatch,
    };
  },
};

export default rules;
