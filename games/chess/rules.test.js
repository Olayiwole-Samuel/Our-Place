import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import { countsTowardWinStreak } from "@/lib/game/result";
import { Chess } from "chess.js";
import rules, { positionEnd } from "./rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("chess");

function start() {
  const session = createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(1), now: 0 });
  // Fix colours for readable tests: A is white.
  return { ...session, state: { ...session.state, seats: { w: A, b: B } } };
}
const act = (session, playerId, type, payload = {}) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(2), now: 1 });
const ok = (result) => {
  expect(result.error).toBeUndefined();
  return result.session;
};
const code = (result) => result.error?.code;
/** Plays UCI moves alternately starting with white (A). */
function play(session, ...moves) {
  let current = session;
  for (const uci of moves) {
    const who = current.state.moves.length % 2 === 0 ? A : B;
    current = ok(act(current, who, "move", { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4], ply: current.state.moves.length }));
  }
  return current;
}
const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });

describe("chess setup", () => {
  it("the server draws colours; the standard position; white moves first", () => {
    const session = createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(7), now: 0 });
    expect(Object.values(session.state.seats).sort()).toEqual([A, B].sort());
    expect(session.state.fen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const white = session.state.seats.w;
    expect(view(session, white).legal.targets.e2).toEqual(["e3", "e4"]);
    expect(view(session, session.state.seats.b).legal.targets).toEqual({}); // not their turn
  });
});

describe("moves and turns", () => {
  it("legal moves are applied; the board, history and turn follow", () => {
    const session = play(start(), "e2e4", "e7e5", "g1f3");
    expect(session.state.history.map((m) => m.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(view(session, B).turn).toBe(B);
    expect(view(session, A).lastMove).toMatchObject({ from: "g1", to: "f3" });
  });

  it("rejects illegal moves, moving the other side's pieces and moving out of turn", () => {
    const session = start();
    expect(code(act(session, A, "move", { from: "e2", to: "e5" }))).toBe("illegal_action");
    expect(code(act(session, A, "move", { from: "e7", to: "e5" }))).toBe("illegal_action"); // black's pawn
    expect(code(act(session, B, "move", { from: "e7", to: "e5" }))).toBe("not_your_turn");
    expect(code(act(session, A, "move", { from: "z9", to: "e4" }))).toBe("malformed_action");
    expect(code(act(session, "stranger", "move", { from: "e2", to: "e4" }))).toBe("not_a_player");
  });

  it("a resent move (same ply) is refused quietly, never applied twice", () => {
    const once = play(start(), "e2e4");
    const again = act(once, A, "move", { from: "e2", to: "e4", ply: 0 });
    expect(code(again)).toBe("already_moved");
    expect(once.state.moves).toEqual(["e2e4"]);
  });

  it("a king in check must get out of check", () => {
    // 1. e4 f5 2. Qh5+ — black must answer the check.
    const session = play(start(), "e2e4", "f7f5", "d1h5");
    expect(view(session, B).inCheck).toBe(true);
    expect(view(session, B).checkSquare).toBe("e8");
    expect(code(act(session, B, "move", { from: "a7", to: "a6", ply: 3 }))).toBe("illegal_action");
    ok(act(session, B, "move", { from: "g7", to: "g6", ply: 3 }));
  });
});

describe("special moves", () => {
  it("castling (king side) moves both king and rook", () => {
    const session = play(start(), "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "e1g1");
    expect(session.state.history.at(-1).san).toBe("O-O");
    expect(view(session, A).board[7][6]).toBe("wk"); // g1
    expect(view(session, A).board[7][5]).toBe("wr"); // f1
  });

  it("en passant captures the passed pawn", () => {
    const session = play(start(), "e2e4", "a7a6", "e4e5", "d7d5", "e5d6");
    expect(session.state.history.at(-1)).toMatchObject({ san: "exd6", flags: "e", captured: "p" });
    expect(view(session, A).board[3][3]).toBeNull(); // d5 is empty
  });

  it("promotion needs a choice, then turns the pawn into it", () => {
    // White pawn walks to h7 and captures on g8.
    let session = play(start(), "h2h4", "g7g5", "h4g5", "h7h6", "g5h6", "f8g7", "h6h7", "a7a6");
    expect(view(session, A).legal.promotions).toContain("h7g8");
    expect(code(act(session, A, "move", { from: "h7", to: "g8", ply: 8 }))).toBe("choose_promotion");
    session = ok(act(session, A, "move", { from: "h7", to: "g8", promotion: "n", ply: 8 }));
    expect(session.state.history.at(-1).san).toBe("hxg8=N");
    expect(view(session, A).board[0][6]).toBe("wn");
  });
});

describe("game end", () => {
  it("checkmate wins and counts toward the win streak", () => {
    // Scholar's mate.
    const session = play(start(), "e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7");
    expect(session.status).toBe("completed");
    expect(session.result).toMatchObject({ outcome: "win", winnerId: A, summary: { reason: "checkmate" } });
    expect(session.result.summary.lines.winner).toBe("Checkmate in 4 moves."); // 7 half-moves = 4 moves
    expect(countsTowardWinStreak(definition, session.result)).toBe(true);
    expect(code(act(session, B, "move", { from: "a7", to: "a6" }))).toBe("session_not_active");
  });

  it("stalemate is a draw (Sam Loyd's ten-move stalemate)", () => {
    const session = play(start(), "e2e3", "a7a5", "d1h5", "a8a6", "h5a5", "h7h5", "h2h4", "a6h6", "a5c7", "f7f6", "c7d7", "e8f7", "d7b7", "d8d3", "b7b8", "d3h7", "b8c8", "f7g6", "c8e6");
    expect(session.result).toMatchObject({ outcome: "draw", winnerId: null, summary: { reason: "stalemate" } });
  });

  it("resignation gives the win to the other player", () => {
    const session = ok(act(play(start(), "e2e4"), B, "resign"));
    expect(session.result).toMatchObject({ outcome: "win", winnerId: A, summary: { reason: "resignation" } });
  });

  it("a draw offer can be accepted, declined, or answered by moving", () => {
    let session = ok(act(start(), A, "offer_draw"));
    expect(code(act(session, A, "accept_draw"))).toBe("no_offer"); // can't accept your own
    expect(code(act(session, A, "offer_draw"))).toBe("already_offered");
    session = ok(act(session, B, "decline_draw"));
    expect(session.state.drawOffer).toBeNull();
    session = ok(act(session, A, "offer_draw"));
    session = ok(act(session, B, "accept_draw"));
    expect(session.result).toMatchObject({ outcome: "draw", summary: { reason: "agreement" } });
    expect(countsTowardWinStreak(definition, session.result)).toBe(false);
  });

  it("threefold repetition is a draw", () => {
    const session = play(start(), "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8");
    expect(session.result).toMatchObject({ outcome: "draw", summary: { reason: "threefold_repetition" } });
  });

  it("insufficient material is a draw", () => {
    expect(positionEnd(new Chess("8/8/8/4k3/8/8/2B5/4K3 b - - 0 1"), { seats: { w: A, b: B } })).toMatchObject({ outcome: "draw", reason: "insufficient_material" });
  });
});

describe("reconnect", () => {
  it("the view is rebuilt from the stored state exactly (a reload shows the same position)", () => {
    const session = play(start(), "d2d4", "d7d5", "c2c4");
    const restored = JSON.parse(JSON.stringify(session));
    expect(view(restored, B)).toEqual(view(session, B));
    expect(view(restored, B).ply).toBe(3);
  });
});
