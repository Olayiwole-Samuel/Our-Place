// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { gameRegistry } from "@/lib/game/catalog";
import { createRandom } from "@/lib/game/random";
import Chess from "./client";
import rules from "./rules";

// The board's move animation: the piece that just moved slides from its old
// square (and the rook when castling) — measured in squares, from your side.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("chess");
beforeAll(() => {
  Element.prototype.scrollTo ??= () => {}; // jsdom has no scrolling; the move list scrolls in browsers
});

function start() {
  const session = createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(1), now: 0 });
  return { ...session, state: { ...session.state, seats: { w: A, b: B } } };
}
function play(session, ...moves) {
  let current = session;
  for (const uci of moves) {
    const who = current.state.moves.length % 2 === 0 ? A : B;
    current = applyPlayerAction(current, { type: "move", payload: { from: uci.slice(0, 2), to: uci.slice(2, 4), ply: current.state.moves.length }, playerId: who }, { definition, rules, random: createRandom(2), now: 1 }).session;
  }
  return current;
}
const viewOf = (session, playerId = A) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });
const board = (view, me = A) => <Chess view={view} me={me} partner={me === A ? B : A} names={{ [B]: "King" }} status="active" busy={false} act={vi.fn()} />;
const slideOn = (container, square) => container.querySelector(`[data-square="${square}"] .chess-slide`);

describe("chess move animation", () => {
  it("a move made while you watch slides from its old square", () => {
    const before = start();
    const { container, rerender } = render(board(viewOf(before, B), B));
    rerender(board(viewOf(play(before, "e2e4"), B), B));
    const slide = slideOn(container, "e4");
    expect(slide).toBeTruthy();
    // Black sees the board flipped: e2 is two squares BELOW e4 on screen for White, ABOVE for Black.
    expect(slide.style.getPropertyValue("--dx")).toBe("0");
    expect(slide.style.getPropertyValue("--dy")).toBe("-2");
  });

  it("castling slides the rook too", () => {
    const before = play(start(), "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6");
    const { container, rerender } = render(board(viewOf(before)));
    rerender(board(viewOf(play(before, "e1g1"))));
    expect(slideOn(container, "g1").style.getPropertyValue("--dx")).toBe("-2"); // king e1 → g1
    expect(slideOn(container, "f1").style.getPropertyValue("--dx")).toBe("2"); // rook h1 → f1
  });

  it("opening a game in progress doesn't replay the last move", () => {
    const { container } = render(board(viewOf(play(start(), "e2e4"))));
    expect(container.querySelector(".chess-slide")).toBeNull();
  });
});
