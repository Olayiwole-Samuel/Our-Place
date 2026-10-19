import { Chess } from "chess.js";
import { GAME_ERROR, gameError } from "@/lib/game/errors";

/**
 * Chess — two players, server-authoritative. The rules of chess (legal moves,
 * check, checkmate, stalemate, castling, en passant, promotion, threefold
 * repetition, the 50-move rule, insufficient material) come from chess.js
 * (BSD-2-Clause), a mature, widely used rules library. This module only decides
 * who may act and turns chess.js positions into Our Place state and results.
 *
 * Clients send intents:
 *   move { from, to, promotion?, ply }   ply = how many moves the client has seen;
 *                                         a resend after a reload is refused quietly
 *   offer_draw {} · accept_draw {} · decline_draw {} · resign {}
 * Colours are drawn by the server. The board, checks and the outcome are always
 * recomputed here from the move list — never taken from a client.
 *
 * State (server-only; view() is the same for both players — chess has no
 * hidden information):
 *   { seats: { w, b }, moves: ["e2e4", …] (UCI), fen, history: [{ san, from, to,
 *     color, captured, flags }], drawOffer: playerId | null, ended: null |
 *     { outcome: "win" | "draw", winnerId, reason } }
 */
const SQUARE = /^[a-h][1-8]$/;
const PROMOTIONS = ["q", "r", "b", "n"];

/** A chess.js game rebuilt from the move list (keeps history for repetition). */
function replay(moves) {
  const chess = new Chess();
  for (const uci of moves) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return chess;
}

const colorOf = (state, playerId) => (state.seats.w === playerId ? "w" : state.seats.b === playerId ? "b" : null);
const playerOf = (state, color) => state.seats[color];

/** Why the game is over in this position, or null. */
export function positionEnd(chess, state) {
  if (chess.isCheckmate()) {
    const loser = chess.turn();
    return { outcome: "win", winnerId: playerOf(state, loser === "w" ? "b" : "w"), reason: "checkmate" };
  }
  if (chess.isStalemate()) return { outcome: "draw", winnerId: null, reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { outcome: "draw", winnerId: null, reason: "insufficient_material" };
  if (chess.isThreefoldRepetition()) return { outcome: "draw", winnerId: null, reason: "threefold_repetition" };
  if (chess.isDrawByFiftyMoves()) return { outcome: "draw", winnerId: null, reason: "fifty_moves" };
  return null;
}

/** Legal moves for the side to move: { e2: ["e3", "e4"], … } plus which of them promote. */
export function legalMoves(chess) {
  const targets = {};
  const promotions = [];
  for (const move of chess.moves({ verbose: true })) {
    (targets[move.from] ??= []).includes(move.to) || targets[move.from].push(move.to);
    if (move.promotion && !promotions.includes(`${move.from}${move.to}`)) promotions.push(`${move.from}${move.to}`);
  }
  return { targets, promotions };
}

const rules = {
  setup({ playerIds, random }) {
    const whiteIndex = random.int(0, 1);
    return {
      seats: { w: playerIds[whiteIndex], b: playerIds[1 - whiteIndex] },
      moves: [],
      fen: new Chess().fen(),
      history: [],
      drawOffer: null,
      ended: null,
    };
  },

  validate(state, action) {
    const color = colorOf(state, action.playerId);
    if (!color) return gameError(GAME_ERROR.NOT_A_PLAYER, "You're not playing this game.");
    if (state.ended) return gameError("game_over", "This game is over.");
    const payload = action.payload ?? {};
    switch (action.type) {
      case "move": {
        const { from, to, promotion, ply } = payload;
        if (!SQUARE.test(from ?? "") || !SQUARE.test(to ?? "")) return gameError(GAME_ERROR.MALFORMED_ACTION, "That move wasn't understood.");
        if (promotion !== undefined && !PROMOTIONS.includes(promotion)) return gameError(GAME_ERROR.MALFORMED_ACTION, "Choose a queen, rook, bishop or knight.");
        // Idempotency: a move sent for an older position (a double tap, a resend after a reload).
        if (Number.isInteger(ply) && ply !== state.moves.length) return gameError("already_moved", "That move was already made.");
        const chess = new Chess(state.fen);
        if (chess.turn() !== color) return gameError(GAME_ERROR.NOT_YOUR_TURN, "It's not your turn.");
        const piece = chess.get(from);
        if (!piece || piece.color !== color) return gameError(GAME_ERROR.ILLEGAL_ACTION, "Move one of your own pieces.");
        const candidates = chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
        if (!candidates.length) return gameError(GAME_ERROR.ILLEGAL_ACTION, chess.inCheck() ? "You must get your king out of check." : "That piece can't move there.");
        if (candidates.some((move) => move.promotion) && !promotion) return gameError("choose_promotion", "Choose what your pawn becomes.");
        return null;
      }
      case "offer_draw":
        if (state.drawOffer === action.playerId) return gameError("already_offered", "You've already offered a draw.");
        if (state.drawOffer) return gameError("draw_pending", "Your partner has offered a draw — accept or decline it.");
        return null;
      case "accept_draw":
      case "decline_draw":
        if (!state.drawOffer || state.drawOffer === action.playerId) return gameError("no_offer", "There's no draw offer to answer.");
        return null;
      case "resign":
        return null;
      default:
        return gameError(GAME_ERROR.MALFORMED_ACTION, "That action wasn't understood.");
    }
  },

  apply(state, action) {
    const color = colorOf(state, action.playerId);
    switch (action.type) {
      case "move": {
        const { from, to, promotion } = action.payload;
        const chess = replay(state.moves);
        const needsPromotion = chess.moves({ square: from, verbose: true }).some((move) => move.to === to && move.promotion);
        const move = chess.move({ from, to, promotion: needsPromotion ? promotion : undefined });
        const next = {
          ...state,
          moves: [...state.moves, `${move.from}${move.to}${move.promotion ?? ""}`],
          fen: chess.fen(),
          history: [...state.history, { san: move.san, from: move.from, to: move.to, color: move.color, captured: move.captured ?? null, flags: move.flags }],
          drawOffer: null, // a move answers (declines) any offer
        };
        return { ...next, ended: positionEnd(chess, next) };
      }
      case "offer_draw":
        return { ...state, drawOffer: action.playerId };
      case "decline_draw":
        return { ...state, drawOffer: null };
      case "accept_draw":
        return { ...state, drawOffer: null, ended: { outcome: "draw", winnerId: null, reason: "agreement" } };
      case "resign":
        return { ...state, drawOffer: null, ended: { outcome: "win", winnerId: playerOf(state, color === "w" ? "b" : "w"), reason: "resignation" } };
      default:
        return state;
    }
  },

  getResult(state) {
    if (!state.ended) return null;
    const { outcome, winnerId, reason } = state.ended;
    const HEADLINES = {
      checkmate: "Checkmate ♚",
      resignation: "Resigned",
      stalemate: "Stalemate",
      insufficient_material: "Draw — not enough pieces to mate",
      threefold_repetition: "Draw — threefold repetition",
      fifty_moves: "Draw — fifty-move rule",
      agreement: "Draw agreed",
    };
    const lines =
      outcome === "win"
        ? reason === "checkmate"
          ? { winner: `Checkmate in ${state.moves.length} moves.`, loser: "{winner} checkmated your king." }
          : { winner: "Your partner resigned.", loser: "You resigned." }
        : null;
    return { outcome, winnerId, summary: { headline: HEADLINES[reason] ?? "Game over", reason, line: outcome === "draw" ? HEADLINES[reason] : undefined, lines, moves: state.moves.length } };
  },

  view(state, playerId) {
    const chess = new Chess(state.fen);
    const myColor = colorOf(state, playerId);
    const toMove = chess.turn();
    const myTurn = !state.ended && toMove === myColor;
    return {
      fen: state.fen,
      board: chess.board().map((row) => row.map((cell) => (cell ? `${cell.color}${cell.type}` : null))),
      seats: state.seats,
      myColor,
      turn: playerOf(state, toMove),
      toMove,
      ply: state.moves.length,
      inCheck: chess.inCheck(),
      checkSquare: chess.inCheck() ? chess.findPiece({ type: "k", color: toMove })[0] : null,
      legal: myTurn ? legalMoves(chess) : { targets: {}, promotions: [] },
      lastMove: state.history.at(-1) ?? null,
      history: state.history.map((move) => move.san),
      captured: {
        w: state.history.filter((move) => move.color === "b" && move.captured).map((move) => move.captured), // white pieces black took
        b: state.history.filter((move) => move.color === "w" && move.captured).map((move) => move.captured),
      },
      drawOffer: state.drawOffer,
      ended: state.ended,
    };
  },
};

export default rules;
