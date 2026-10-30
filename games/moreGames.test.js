import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { gameAvailability } from "@/lib/game/gating";
import { NEVER_HAVE_I_EVER } from "@/lib/game/questions/neverHaveIEver";
import { validatePrompt } from "@/lib/game/questions/validate";
import { createRandom } from "@/lib/game/random";
import battleship, { SHIPS, SIZE as SEA, randomFleet } from "./battleship/rules";
import hangman from "./hangman/rules";
import neverHaveIEver from "./never_have_i_ever/rules";
import reversi, { legalSquares } from "./reversi/rules";

/** Reversi, Battleship, Hangman and Never Have I Ever. */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const other = (id) => (id === A ? B : A);

function harness(gameId, rules, options = {}, seed = 1) {
  const definition = gameRegistry.get(gameId);
  const start = () => createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], options, random: createRandom(seed), now: 0 });
  const act = (session, playerId, type, payload = {}) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(session.version + 3), now: 1 });
  const ok = (result) => {
    expect(result.error ?? null).toBeNull();
    return result.session;
  };
  const code = (result) => result.error?.code;
  const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });
  return { start, act, ok, code, view };
}

it("all four are playable", () => {
  for (const id of ["reversi", "battleship", "hangman", "never_have_i_ever"]) expect(gameAvailability(gameRegistry.get(id)).launchable, id).toBe(true);
  expect(NEVER_HAVE_I_EVER.every((s) => validatePrompt(s))).toBe(true);
  expect(new Set(NEVER_HAVE_I_EVER.map((s) => s.id)).size).toBe(NEVER_HAVE_I_EVER.length);
});

describe("Reversi", () => {
  const { start, act, ok, code, view } = harness("reversi", reversi);
  const black = (s) => Object.keys(s.state.sides).find((id) => s.state.sides[id] === "b");

  it("opens with four legal moves for Black, flips trapped discs, then it's White's turn", () => {
    let session = start();
    const b = black(session);
    expect(legalSquares(session.state.board, "b").sort((x, y) => x - y)).toEqual([19, 26, 37, 44]);
    expect(code(act(session, other(b), "place", { square: 19 }))).toBe("not_your_turn");
    expect(code(act(session, b, "place", { square: 0 }))).toBe("illegal_action");
    session = ok(act(session, b, "place", { square: 19 }));
    expect(session.state.board[27]).toBe("b"); // flipped
    expect(view(session, b).counts).toEqual({ b: 4, w: 1 });
    expect(view(session, other(b)).legal.length).toBeGreaterThan(0);
  });

  it("ends when nobody can move: more discs wins", () => {
    let session = start();
    const b = black(session);
    // A corner of a board: Black's move flips White's last disc, and then nobody can move.
    const board = Array(64).fill(null);
    board[0] = "b";
    board[1] = "w";
    session = { ...session, state: { ...session.state, board } };
    session = ok(act(session, b, "place", { square: 2 }));
    expect(session.result).toMatchObject({ outcome: "win", winnerId: b, scores: { [b]: 3, [other(b)]: 0 } });
  });
});

describe("Battleship", () => {
  const { start, act, ok, code, view } = harness("battleship", battleship);

  it("lays out fleets that fit and never touch", () => {
    for (let seed = 1; seed < 40; seed++) {
      const fleet = randomFleet(createRandom(seed));
      expect(fleet.map((s) => s.cells.length)).toEqual(SHIPS.map((s) => s.length));
      const cells = fleet.flatMap((s) => s.cells);
      expect(new Set(cells).size).toBe(cells.length);
      for (const ship of fleet) {
        for (const otherShip of fleet.filter((s) => s !== ship)) {
          for (const c of ship.cells) for (const d of otherShip.cells) expect(Math.max(Math.abs(Math.floor(c / SEA) - Math.floor(d / SEA)), Math.abs((c % SEA) - (d % SEA)))).toBeGreaterThan(1);
        }
      }
    }
  });

  it("keeps the other fleet secret, fires in turns, and sinking everything wins", () => {
    let session = start();
    expect(JSON.stringify(view(session, A))).not.toContain(JSON.stringify(session.state.fleets[B][0].cells));
    expect(code(act(session, A, "fire", { cell: 0 }))).toBe("illegal_action"); // not ready yet
    const before = session.state.fleets[A];
    session = ok(act(session, A, "shuffle"));
    expect(session.state.fleets[A]).not.toEqual(before);
    session = ok(act(session, A, "ready"));
    expect(code(act(session, A, "shuffle"))).toBe("illegal_action");
    session = ok(act(session, B, "ready"));
    expect(session.state.phase).toBe("firing");
    const shooter = session.state.current;
    // The shooter fires on every enemy ship cell; the other player fires at empty water in between.
    const targets = session.state.fleets[other(shooter)].flatMap((s) => s.cells);
    const theirShips = new Set(session.state.fleets[shooter].flatMap((s) => s.cells));
    const water = Array.from({ length: 100 }, (_, i) => i).filter((i) => !theirShips.has(i));
    for (let i = 0; i < targets.length; i++) {
      session = ok(act(session, shooter, "fire", { cell: targets[i] }));
      if (session.status === "completed") break;
      expect(code(act(session, shooter, "fire", { cell: targets[i + 1] }))).toBe("not_your_turn");
      session = ok(act(session, other(shooter), "fire", { cell: water[i] }));
    }
    expect(session.result).toMatchObject({ outcome: "win", winnerId: shooter, scores: { [shooter]: 17 } });
    expect(view(session, other(shooter)).sunkShips).toHaveLength(5);
  });
});

describe("Hangman", () => {
  const { start, act, ok, code, view } = harness("hangman", hangman, { rounds: 2 });

  it("hides the word from the guesser, scores a solve, and the setter scores a hanging", () => {
    let session = start();
    const setter = session.state.setter;
    const guesser = other(setter);
    expect(code(act(session, guesser, "set", { word: "love" }))).toBe("not_your_turn");
    expect(code(act(session, setter, "set", { word: "x1" }))).toBe("malformed_action");
    session = ok(act(session, setter, "set", { word: "Jollof Rice", hint: "Party food" }));
    expect(view(session, guesser)).toMatchObject({ word: null, hint: "Party food" });
    expect(view(session, guesser).pattern.join("")).toBe("______ ____");
    expect(view(session, setter).word).toBe("jollof rice");
    session = ok(act(session, guesser, "guess", { letter: "o" }));
    expect(view(session, guesser).pattern.join("")).toBe("_o__o_ ____");
    session = ok(act(session, guesser, "guess", { letter: "z" }));
    expect(session.state.misses).toBe(1);
    expect(code(act(session, guesser, "guess", { letter: "z" }))).toBe("illegal_action");
    session = ok(act(session, guesser, "solve", { word: "jollof  rice" }));
    expect(session.state.phase).toBe("reveal");
    expect(session.state.scores[guesser]).toBe(6); // 7 − 1 miss
    session = ok(act(session, guesser, "next"));
    // Round 2: roles swap; six misses hangs the guesser.
    expect(session.state.setter).toBe(guesser);
    session = ok(act(session, guesser, "set", { word: "baby" }));
    for (const letter of "cdefgh") session = ok(act(session, setter, "guess", { letter }));
    expect(session.state.scores[guesser]).toBe(6 + 3);
    session = ok(act(session, setter, "next"));
    expect(session.result).toMatchObject({ outcome: "win", winnerId: guesser });
  });
});

describe("Never Have I Ever", () => {
  it("reveals answers together and puts fingers down", async () => {
    const services = { questions: { draw: async ({ count }) => NEVER_HAVE_I_EVER.slice(0, count) } };
    const options = { rounds: 2, ...(await neverHaveIEver.prepare({ coupleId: "c", options: { rounds: 2 }, random: createRandom(1), services })) };
    const { start, act, ok, view } = harness("never_have_i_ever", neverHaveIEver, options);
    let session = start();
    session = ok(act(session, A, "answer", { choice: "have" }));
    expect(view(session, B)).toMatchObject({ partnerAnswered: true, partnerAnswer: null, fingers: { [A]: 10, [B]: 10 } }); // nothing leaks
    session = ok(act(session, B, "answer", { choice: "never" }));
    expect(view(session, B)).toMatchObject({ partnerAnswer: "have", fingers: { [A]: 9, [B]: 10 } });
    session = ok(act(session, A, "next"));
    session = ok(act(session, B, "next"));
    session = ok(act(session, A, "answer", { choice: "have" }));
    session = ok(act(session, B, "answer", { choice: "have" }));
    session = ok(act(session, A, "next"));
    session = ok(act(session, B, "next"));
    expect(session.result).toMatchObject({ outcome: "completed", summary: { rounds: 2, both: 1 } });
  });
});
