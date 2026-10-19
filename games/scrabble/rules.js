import { GAME_ERROR, gameError } from "@/lib/game/errors";
import { LETTER_VALUES, RACK_SIZE, allTiles } from "./board";
import { isWord } from "./dictionary";
import { evaluatePlacement as evaluate } from "./scoring";

/**
 * Word board (Scrabble-style, standard rules) — two players, server-authoritative.
 *
 * Clients send intents only:
 *   place { tiles: [{ id, row, col, letter? }], turn }   letter = what a blank stands for
 *   exchange { ids, turn } · pass { turn } · resign {}
 * `turn` is the move counter the client has seen; a resend is refused quietly.
 * The server checks tile ownership, placement, every word formed (ENABLE word
 * list, public domain), and computes the score — a client never sends a score.
 *
 * Rules:
 * - 7-tile racks from a shared, server-shuffled bag of 100 (2 blanks).
 * - A play is 1+ tiles in one row or column, with no gaps (existing tiles may
 *   fill them). The first play covers the centre star and is at least 2 letters;
 *   later plays must touch existing tiles.
 * - Every word formed (the main word and each crossword of 2+ letters) must be
 *   in the word list. Letter premiums apply to new tiles only; word premiums
 *   multiply every word that a new tile on them is part of. Blanks score 0.
 *   Using all 7 rack tiles adds 50.
 * - Exchange 1–7 tiles only while the bag holds at least 7. Exchanging and
 *   passing score nothing.
 * - The game ends when a player uses their last tile with the bag empty (they
 *   gain the value of the partner's remaining tiles, which the partner loses),
 *   or after six scoreless turns in a row (each player loses their rack's value).
 *   Higher score wins; equal scores are a draw. Resigning gives the partner the win.
 *
 * View: your rack, the partner's tile COUNT, the bag's size (never its order).
 */
const LETTER = /^[A-Z]$/;
export const SCORELESS_LIMIT = 6;

const key = (row, col) => `${row},${col}`;
/** Placement check + score with the server's word list. */
export const evaluatePlacement = (board, placed, options = {}) => evaluate(board, placed, { checkWord: isWord, ...options });
const other = (state, playerId) => state.players.find((id) => id !== playerId);
const tileValue = (tile) => (tile.blank ? 0 : LETTER_VALUES[tile.letter]);
const rackValue = (rack) => rack.reduce((sum, tile) => sum + (tile.letter === "?" ? 0 : LETTER_VALUES[tile.letter]), 0);

const draw = (bag, count) => ({ drawn: bag.slice(Math.max(0, bag.length - count)), bag: bag.slice(0, Math.max(0, bag.length - count)) });

function finish(state, reason, outPlayer = null) {
  const scores = { ...state.scores };
  const adjustments = {};
  if (reason === "out") {
    const loser = other(state, outPlayer);
    const left = rackValue(state.racks[loser]);
    scores[loser] -= left;
    scores[outPlayer] += left;
    adjustments[loser] = -left;
    adjustments[outPlayer] = left;
  } else if (reason === "scoreless") {
    for (const id of state.players) {
      const left = rackValue(state.racks[id]);
      scores[id] -= left;
      adjustments[id] = -left;
    }
  }
  return { ...state, scores, ended: { reason, adjustments } };
}

const rules = {
  setup({ playerIds, random }) {
    const bag = random.shuffle(allTiles());
    const racks = {};
    let rest = bag;
    for (const id of playerIds) {
      const { drawn, bag: remaining } = draw(rest, RACK_SIZE);
      racks[id] = drawn;
      rest = remaining;
    }
    return {
      players: [...playerIds],
      board: {}, // "r,c" → { letter, blank, by }
      racks,
      bag: rest,
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      current: playerIds[random.int(0, 1)],
      turn: 1,
      scoreless: 0,
      moves: [], // public: { by, type, words?, score?, count?, cells? }
      ended: null,
    };
  },

  validate(state, action) {
    const { playerId, type } = action;
    const payload = action.payload ?? {};
    if (!state.players.includes(playerId)) return gameError(GAME_ERROR.NOT_A_PLAYER, "You're not playing this game.");
    if (state.ended) return gameError("game_over", "This game is over.");
    if (type === "resign") return null;
    if (!["place", "exchange", "pass"].includes(type)) return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    if (Number.isInteger(payload.turn) && payload.turn !== state.turn) return gameError("already_played", "That move was already made.");
    if (state.current !== playerId) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
    const rack = state.racks[playerId];
    if (type === "pass") return null;
    if (type === "exchange") {
      const ids = payload.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > RACK_SIZE || new Set(ids).size !== ids.length) return gameError(GAME_ERROR.MALFORMED_ACTION, "Choose the tiles to swap.");
      if (!ids.every((id) => rack.some((tile) => tile.id === id))) return gameError(GAME_ERROR.ILLEGAL_ACTION, "You can only swap tiles from your own rack.");
      if (state.bag.length < RACK_SIZE) return gameError(GAME_ERROR.ILLEGAL_ACTION, "Swapping needs at least 7 tiles in the bag.");
      return null;
    }
    // place
    const tiles = payload.tiles;
    if (!Array.isArray(tiles) || !tiles.length || tiles.length > RACK_SIZE) return gameError(GAME_ERROR.MALFORMED_ACTION, "Place one to seven tiles.");
    if (new Set(tiles.map((t) => t?.id)).size !== tiles.length) return gameError(GAME_ERROR.MALFORMED_ACTION, "Each tile can be placed once.");
    for (const tile of tiles) {
      const owned = rack.find((r) => r.id === tile?.id);
      if (!owned) return gameError(GAME_ERROR.ILLEGAL_ACTION, "You can only play tiles from your own rack.");
      if (owned.letter === "?" && !LETTER.test(tile.letter ?? "")) return gameError("choose_letter", "Choose a letter for your blank tile.");
    }
    const evaluation = evaluatePlacement(state.board, placedFrom(rack, tiles));
    if (evaluation.error) return gameError(evaluation.invalid ? "invalid_word" : GAME_ERROR.ILLEGAL_ACTION, evaluation.error);
    return null;
  },

  apply(state, action, { random }) {
    const { playerId, type } = action;
    const payload = action.payload ?? {};
    const opponent = other(state, playerId);
    const turn = state.turn + 1;
    if (type === "resign") return { ...state, ended: { reason: "resignation", resigned: playerId, adjustments: {} } };

    if (type === "pass" || type === "exchange") {
      let next = { ...state, turn, current: opponent, scoreless: state.scoreless + 1 };
      if (type === "exchange") {
        const rack = state.racks[playerId];
        const returned = rack.filter((tile) => payload.ids.includes(tile.id));
        const { drawn, bag } = draw(state.bag, returned.length);
        next = { ...next, racks: { ...state.racks, [playerId]: [...rack.filter((tile) => !payload.ids.includes(tile.id)), ...drawn] }, bag: random.shuffle([...bag, ...returned]) };
      }
      next = { ...next, moves: [...state.moves, { by: playerId, type, count: type === "exchange" ? payload.ids.length : 0 }] };
      return next.scoreless >= SCORELESS_LIMIT ? finish(next, "scoreless") : next;
    }

    // place
    const rack = state.racks[playerId];
    const placed = placedFrom(rack, payload.tiles);
    const { words, score, bingo } = evaluatePlacement(state.board, placed);
    const board = { ...state.board };
    for (const tile of placed) board[key(tile.row, tile.col)] = { letter: tile.letter, blank: tile.blank, by: playerId };
    const usedIds = payload.tiles.map((t) => t.id);
    const kept = rack.filter((tile) => !usedIds.includes(tile.id));
    const { drawn, bag } = draw(state.bag, RACK_SIZE - kept.length);
    const next = {
      ...state,
      board,
      bag,
      racks: { ...state.racks, [playerId]: [...kept, ...drawn] },
      scores: { ...state.scores, [playerId]: state.scores[playerId] + score },
      turn,
      current: opponent,
      scoreless: 0,
      moves: [...state.moves, { by: playerId, type: "place", words, score, bingo, cells: placed.map((t) => key(t.row, t.col)) }],
    };
    return next.racks[playerId].length === 0 && bag.length === 0 ? finish(next, "out", playerId) : next;
  },

  getResult(state) {
    if (!state.ended) return null;
    const [a, b] = state.players;
    const scores = { [a]: state.scores[a], [b]: state.scores[b] };
    if (state.ended.reason === "resignation") {
      return { outcome: "win", winnerId: other(state, state.ended.resigned), scores, summary: { headline: "Resigned", reason: "resignation", lines: { winner: "Your partner resigned.", loser: "You resigned." } } };
    }
    const why = state.ended.reason === "out" ? "All tiles played." : "Six scoreless turns in a row.";
    if (scores[a] === scores[b]) return { outcome: "draw", scores, summary: { headline: "It's a tie", reason: state.ended.reason, line: `${why} ${scores[a]} each.` } };
    const winnerId = scores[a] > scores[b] ? a : b;
    const loserId = other(state, winnerId);
    return {
      outcome: "win",
      winnerId,
      scores,
      summary: {
        headline: "Words well played 🔠",
        reason: state.ended.reason,
        lines: { winner: `${why} You won ${scores[winnerId]} – ${scores[loserId]}.`, loser: `${why} {winner} won ${scores[winnerId]} – ${scores[loserId]}.` },
      },
    };
  },

  view(state, playerId) {
    const opponent = other(state, playerId);
    return {
      board: state.board,
      rack: state.racks[playerId] ?? [],
      partnerTiles: state.racks[opponent]?.length ?? 0,
      partnerRack: state.ended ? state.racks[opponent] : null, // shown once the game is over
      bagCount: state.bag.length,
      scores: state.scores,
      current: state.current,
      turn: state.turn,
      scoreless: state.scoreless,
      lastMove: state.moves.at(-1) ?? null,
      history: state.moves.slice(-30),
      ended: state.ended,
    };
  },
};

/** Rack tiles as placed tiles ({ row, col, letter, blank }). Assumes ownership was checked. */
function placedFrom(rack, tiles) {
  return tiles.map((tile) => {
    const owned = rack.find((r) => r.id === tile.id);
    const blank = owned.letter === "?";
    return { row: tile.row, col: tile.col, letter: blank ? tile.letter : owned.letter, blank };
  });
}

export default rules;
export { rackValue, tileValue };
