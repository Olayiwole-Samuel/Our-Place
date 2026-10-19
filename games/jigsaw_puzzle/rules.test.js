import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import { countsTowardWinStreak } from "@/lib/game/result";
import rules, { HOLD_MS } from "./rules";
import { DIFFICULTIES, drawEdges, pieceSides, piecePath } from "./shapes";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("jigsaw_puzzle");

const act = (session, playerId, type, payload = {}, now = 1000) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(8), now });
const ok = (result) => {
  expect(result.error).toBeUndefined();
  return result.session;
};
const code = (result) => result.error?.code;
const view = (session, playerId, now = 1000) => getPlayerView(session, playerId, { rules, random: createRandom(3), now });

function started(difficulty = "easy") {
  let session = createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(1), now: 0 });
  session = ok(act(session, A, "configure", { difficulty }));
  return ok(act(session, B, "start"));
}
const indexOf = (session, col, row) => row * session.state.grid.cols + col;

describe("pieces", () => {
  it("cuts the grid for each difficulty and scatters every piece away from its place", () => {
    for (const [difficulty, { cols, rows }] of Object.entries(DIFFICULTIES)) {
      const session = started(difficulty);
      expect(session.state.pieces).toHaveLength(cols * rows);
      for (const piece of session.state.pieces) {
        expect(Math.hypot(piece.x - piece.col, piece.y - piece.row)).toBeGreaterThanOrEqual(1.2);
        expect(piece.placed).toBe(false);
      }
    }
  });

  it("neighbouring pieces always fit: one tab out, the other in; the border is flat", () => {
    const grid = { cols: 4, rows: 3 };
    const edges = drawEdges(grid, createRandom(5));
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const sides = pieceSides(edges, grid, col, row);
        if (col < 3) expect(sides.right).toBe(-pieceSides(edges, grid, col + 1, row).left);
        if (row < 2) expect(sides.bottom).toBe(-pieceSides(edges, grid, col, row + 1).top);
        if (row === 0) expect(sides.top).toBe(0);
        if (col === 0) expect(sides.left).toBe(0);
      }
    }
    expect(piecePath({ top: 0, right: 1, bottom: -1, left: 0 })).toMatch(/^M0 0 .* Z$/);
  });
});

describe("snapping (decided by the server)", () => {
  it("a piece dropped near its true place snaps into the frame and locks", () => {
    let session = started();
    const piece = indexOf(session, 1, 1);
    session = ok(act(session, A, "drop", { piece, x: 1.2, y: 0.9 }));
    expect(session.state.pieces[piece]).toMatchObject({ x: 1, y: 1, placed: true });
    expect(code(act(session, B, "grab", { piece }))).toBe("already_placed");
  });

  it("a drop far from its place stays loose — a client can't claim it fits", () => {
    let session = started();
    const piece = indexOf(session, 1, 1);
    session = ok(act(session, A, "drop", { piece, x: 2.5, y: 2.6 }));
    expect(session.state.pieces[piece]).toMatchObject({ x: 2.5, y: 2.6, placed: false });
  });

  it("two matching neighbours join into a group and then move together", () => {
    let session = started();
    const left = indexOf(session, 0, 0);
    const right = indexOf(session, 1, 0);
    session = ok(act(session, A, "drop", { piece: left, x: -2, y: 2 }));
    session = ok(act(session, B, "drop", { piece: right, x: -0.9, y: 2.05 })); // right of `left`, slightly off
    expect(session.state.pieces[right].group).toBe(session.state.pieces[left].group);
    expect(session.state.pieces[right]).toMatchObject({ x: -1, y: 2 }); // aligned exactly
    session = ok(act(session, A, "drop", { piece: left, x: 3.5, y: 2.5 }));
    expect(session.state.pieces[right]).toMatchObject({ x: 4.5, y: 2.5 }); // moved with it
  });

  it("joining a group that's in place puts the newcomer in place too", () => {
    let session = started();
    const a = indexOf(session, 0, 0);
    const b = indexOf(session, 1, 0);
    session = ok(act(session, A, "drop", { piece: a, x: 0, y: 0 }));
    session = ok(act(session, A, "drop", { piece: b, x: 1.2, y: 0.15 }));
    expect(session.state.pieces[b]).toMatchObject({ x: 1, y: 0, placed: true });
  });
});

describe("two players at once", () => {
  it("a piece held by one partner is refused to the other until dropped or expired", () => {
    let session = started();
    const piece = indexOf(session, 2, 2);
    session = ok(act(session, A, "grab", { piece }, 1000));
    expect(code(act(session, B, "grab", { piece }, 2000))).toBe("held");
    expect(code(act(session, B, "drop", { piece, x: 1, y: 1 }, 2000))).toBe("held");
    expect(view(session, B, 2000).holds).toEqual({ [session.state.pieces[piece].group]: "partner" });
    // The hold expires (a partner who walked away can't block the puzzle).
    ok(act(session, B, "grab", { piece }, 1000 + HOLD_MS + 1));
    // Or the holder drops it.
    session = ok(act(session, A, "drop", { piece, x: -1, y: -0.5 }, 3000));
    ok(act(session, B, "grab", { piece }, 3001));
  });

  it("both can work on different pieces simultaneously", () => {
    let session = started();
    session = ok(act(session, A, "grab", { piece: 0 }));
    session = ok(act(session, B, "grab", { piece: 5 }));
    session = ok(act(session, B, "drop", { piece: 5, x: -1.5, y: 1 }));
    session = ok(act(session, A, "drop", { piece: 0, x: 4.9, y: 0 }));
    expect(session.state.pieces[5]).toMatchObject({ x: -1.5, y: 1 });
    expect(session.state.pieces[0]).toMatchObject({ x: 4.9, y: 0 });
  });
});

describe("restore, restart and completion", () => {
  it("the shared state survives a reload exactly", () => {
    const session = ok(act(started(), A, "drop", { piece: 3, x: 4.4, y: 1.1 }));
    const reloaded = JSON.parse(JSON.stringify(session));
    expect(view(reloaded, B)).toEqual(view(session, B));
  });

  it("restart goes back to choosing a picture", () => {
    const session = ok(act(started(), B, "restart"));
    expect(session.state).toMatchObject({ phase: "choose", pieces: [] });
    expect(code(act(session, A, "configure", { image: "builtin:not_real" }))).toBe("malformed_action");
  });

  it("placing every piece completes the puzzle together — no winner, no streak", () => {
    let session = started();
    for (let i = 0; i < session.state.pieces.length && session.status === "active"; i += 1) {
      const piece = session.state.pieces[i];
      if (piece.placed) continue;
      session = ok(act(session, i % 2 ? A : B, "drop", { piece: i, x: piece.col, y: piece.row }));
    }
    expect(session.status).toBe("completed");
    expect(session.result).toMatchObject({ outcome: "completed", winnerId: null });
    expect(countsTowardWinStreak(definition, session.result)).toBe(false);
    expect(view(session, A).progress).toEqual({ placed: 12, total: 12 });
  });
});
