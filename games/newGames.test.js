import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { gameAvailability } from "@/lib/game/gating";
import { createRandom } from "@/lib/game/random";
import { countsTowardWinStreak } from "@/lib/game/result";
import { DARE_PROMPTS, ROULETTE_PROMPTS, SPICY_WYR_QUESTIONS, TRUTH_PROMPTS } from "@/lib/game/questions/spicy";
import { validatePrompt, validateQuestion } from "@/lib/game/questions/validate";
import checkers, { legalMoves } from "./checkers/rules";
import connect4 from "./connect_4/rules";
import memory from "./memory_concentration/rules";
import roulette, { SEGMENTS } from "./question_roulette/rules";
import truthOrDare from "./truth_or_dare/rules";
import spicyWyr from "./would_you_rather_spicy/rules";

/**
 * The games added together: Connect 4, Checkers, Memory, and the 18+ trio
 * (Truth or Dare, Would You Rather — Spicy, Question Roulette).
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function harness(gameId, rules, options = {}, seed = 1) {
  const definition = gameRegistry.get(gameId);
  const start = () => createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], options, random: createRandom(seed), now: 0 });
  const act = (session, playerId, type, payload = {}) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(2), now: 1 });
  const ok = (result) => {
    expect(result.error ?? null).toBeNull();
    return result.session;
  };
  const code = (result) => result.error?.code;
  const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });
  return { definition, start, act, ok, code, view };
}

// A fake question provider, like the server's: returns the first `count` of a bank.
const BANKS = {
  would_you_rather_spicy: SPICY_WYR_QUESTIONS,
  truth_or_dare_truth: TRUTH_PROMPTS,
  truth_or_dare_dare: DARE_PROMPTS,
  ...Object.fromEntries(Object.entries(ROULETTE_PROMPTS).map(([level, list]) => [`question_roulette_${level}`, list])),
};
const services = { questions: { draw: async ({ gameId, count }) => BANKS[gameId].slice(0, count) } };

describe("the catalog", () => {
  it("has the new games playable, and the 18+ ones only when you've both opted in", () => {
    for (const id of ["connect_4", "checkers", "memory_concentration"]) {
      const definition = gameRegistry.get(id);
      expect(gameAvailability(definition).launchable, id).toBe(true);
      expect(definition.winStreakEligible).toBe(true);
    }
    for (const id of ["truth_or_dare", "would_you_rather_spicy", "question_roulette"]) {
      const definition = gameRegistry.get(id);
      expect(definition.mature).toBe(true);
      expect(definition.winStreakEligible).toBe(false);
      expect(gameAvailability(definition)).toMatchObject({ launchable: false, status: "locked" });
      expect(gameAvailability(definition, { matureEnabled: true }).launchable).toBe(true);
    }
  });

  it("every 18+ prompt is valid, and ids are unique across the banks", () => {
    const prompts = [...TRUTH_PROMPTS, ...DARE_PROMPTS, ...Object.values(ROULETTE_PROMPTS).flat()];
    expect(prompts.every((p) => validatePrompt(p))).toBe(true);
    expect(SPICY_WYR_QUESTIONS.every((q) => validateQuestion(q))).toBe(true);
    const ids = [...prompts, ...SPICY_WYR_QUESTIONS].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TRUTH_PROMPTS.length).toBeGreaterThanOrEqual(40);
    expect(DARE_PROMPTS.length).toBeGreaterThanOrEqual(40);
    expect(SPICY_WYR_QUESTIONS.length).toBeGreaterThanOrEqual(50);
    for (const level of ["flirty", "spicy", "hot", "wild"]) expect(ROULETTE_PROMPTS[level].length).toBeGreaterThanOrEqual(8);
    expect(validatePrompt({ id: "x-1", text: "<b>hi</b>" })).toBeNull();
    expect(validatePrompt({ id: "x-1", text: "x".repeat(201) })).toBeNull();
  });
});

describe("Connect 4", () => {
  const { start, act, ok, code, view } = harness("connect_4", connect4);
  const first = (session) => session.state.turn.order[session.state.turn.index];

  it("discs fall to the bottom, turns alternate, and four in a row wins", () => {
    let session = start();
    const red = first(session);
    const yellow = red === A ? B : A;
    expect(code(act(session, yellow, "drop", { column: 0 }))).toBe("not_your_turn");
    // Red builds along the bottom row; yellow stacks on top of red.
    for (const column of [0, 1, 2]) {
      session = ok(act(session, red, "drop", { column }));
      session = ok(act(session, yellow, "drop", { column }));
    }
    expect(session.state.cells[35]).toBe(red); // bottom-left
    expect(session.state.cells[28]).toBe(yellow); // on top of it
    session = ok(act(session, red, "drop", { column: 3 }));
    expect(session.status).toBe("completed");
    expect(session.result).toMatchObject({ outcome: "win", winnerId: red });
    expect(session.result.summary.line).toEqual([35, 36, 37, 38]);
    expect(view(session, A).line).toEqual([35, 36, 37, 38]);
    expect(countsTowardWinStreak(gameRegistry.get("connect_4"), session.result)).toBe(true);
  });

  it("finds diagonals, and refuses a full column or a made-up one", () => {
    let session = start(7);
    const red = first(session);
    const yellow = red === A ? B : A;
    // A rising diagonal for red: (5,0) (4,1) (3,2) (2,3).
    const moves = [
      [red, 0],
      [yellow, 1],
      [red, 1],
      [yellow, 2],
      [red, 2],
      [yellow, 3],
      [red, 2],
      [yellow, 3],
      [red, 3],
      [yellow, 6],
    ];
    for (const [player, column] of moves) session = ok(act(session, player, "drop", { column }));
    expect(code(act(session, red, "drop", { column: 9 }))).toBe("malformed_action");
    session = ok(act(session, red, "drop", { column: 3 }));
    expect(session.result).toMatchObject({ outcome: "win", winnerId: red });

    let full = start();
    const p1 = first(full);
    const p2 = p1 === A ? B : A;
    for (let i = 0; i < 6; i++) full = ok(act(full, i % 2 ? p2 : p1, "drop", { column: 0 }));
    expect(code(act(full, p1, "drop", { column: 0 }))).toBe("illegal_action");
  });
});

describe("Checkers", () => {
  const { start, act, ok, code, view } = harness("checkers", checkers);
  const sides = (session) => {
    const dark = Object.keys(session.state.sides).find((id) => session.state.sides[id] === "b");
    return { dark, light: dark === A ? B : A };
  };
  const at = (row, col) => row * 8 + col;

  it("sets up 12 each on dark squares; dark moves first, forward only", () => {
    const session = start();
    const { dark, light } = sides(session);
    expect(session.state.board.filter((p) => p?.c === "b")).toHaveLength(12);
    expect(session.state.board.filter((p) => p?.c === "w")).toHaveLength(12);
    expect(code(act(session, light, "move", { from: at(2, 1), to: at(3, 0) }))).toBe("not_your_turn");
    expect(code(act(session, dark, "move", { from: at(5, 0), to: at(6, 1) }))).toBe("illegal_action"); // occupied / backward
    expect(Object.keys(view(session, dark).legal).length).toBe(4); // the front row of dark can move
    expect(view(session, light).legal).toEqual({});
    ok(act(session, dark, "move", { from: at(5, 0), to: at(4, 1) }));
  });

  it("forces a jump, keeps a multi-jump going, and crowns a king", () => {
    let session = start();
    const { dark, light } = sides(session);
    // A hand-built position: dark man at (5,2); light men at (4,3) and (2,5); light king far away.
    const board = Array(64).fill(null);
    board[at(5, 2)] = { c: "b", k: false };
    board[at(4, 3)] = { c: "w", k: false };
    board[at(2, 5)] = { c: "w", k: false };
    board[at(0, 7)] = { c: "w", k: false };
    board[at(7, 0)] = { c: "b", k: false };
    session = { ...session, state: { ...session.state, board } };
    expect(legalMoves(session.state).jumping).toBe(true);
    expect(code(act(session, dark, "move", { from: at(7, 0), to: at(6, 1) }))).toBe("illegal_action"); // must jump
    session = ok(act(session, dark, "move", { from: at(5, 2), to: at(3, 4) }));
    expect(session.state.chain).toBe(at(3, 4)); // can jump again — still dark's turn
    expect(view(session, dark).turn).toBe(dark);
    session = ok(act(session, dark, "move", { from: at(3, 4), to: at(1, 6) }));
    expect(session.state.board[at(4, 3)]).toBeNull();
    expect(session.state.board[at(2, 5)]).toBeNull();
    expect(session.state.turn).toBe("w");
    // Light's last man must now jump back over the dark piece.
    expect(view(session, light).legal).toEqual({ [at(0, 7)]: [at(2, 5)] });
  });

  it("wins when the other side can't move, and lets you resign", () => {
    let session = start();
    const { dark, light } = sides(session);
    const board = Array(64).fill(null);
    board[at(2, 1)] = { c: "b", k: false };
    board[at(1, 2)] = { c: "w", k: false };
    session = { ...session, state: { ...session.state, board } };
    session = ok(act(session, dark, "move", { from: at(2, 1), to: at(0, 3) })); // jumps the last light piece, crowned
    expect(session.state.board[at(0, 3)]).toEqual({ c: "b", k: true });
    expect(session.result).toMatchObject({ outcome: "win", winnerId: dark });

    const fresh = start();
    const resigned = ok(act(fresh, light, "resign"));
    expect(resigned.result).toMatchObject({ outcome: "win", winnerId: dark });
  });
});

describe("Memory", () => {
  const { start, act, ok, code, view } = harness("memory_concentration", memory);

  it("hides faces, keeps the turn on a pair, passes it on a miss, and the most pairs wins", () => {
    let session = start();
    const faces = session.state.faces;
    expect(faces).toHaveLength(24);
    expect(view(session, A).cards.every((c) => c.face === null)).toBe(true); // nothing showing
    let player = session.state.current;
    const other = (id) => (id === A ? B : A);
    expect(code(act(session, other(player), "flip", { index: 0 }))).toBe("not_your_turn");

    // A miss first: card 0 and a card with a different face.
    const miss = faces.findIndex((f) => f !== faces[0]);
    session = ok(act(session, player, "flip", { index: 0 }));
    expect(view(session, other(player)).cards[0].face).toBe(faces[0]); // both see the flipped card
    expect(code(act(session, player, "flip", { index: 0 }))).toBe("illegal_action");
    session = ok(act(session, player, "flip", { index: miss }));
    expect(session.state.current).toBe(other(player));
    player = other(player);

    // Then clear the board in pairs: the turn stays with whoever matches.
    const done = new Set();
    for (let i = 0; i < faces.length; i++) {
      if (done.has(i)) continue;
      const j = faces.findIndex((f, k) => k !== i && f === faces[i]);
      done.add(i).add(j);
      session = ok(act(session, player, "flip", { index: i }));
      session = ok(act(session, player, "flip", { index: j }));
      if (session.status !== "completed") expect(session.state.current).toBe(player);
    }
    expect(session.result).toMatchObject({ outcome: "win", winnerId: player });
    expect(session.result.scores[player]).toBe(12);
  });
});

describe("18+ conversation games", () => {
  it("Truth or Dare: pick, do it or chicken out, partner reacts, turns alternate", async () => {
    const options = { rounds: 2, ...(await truthOrDare.prepare({ coupleId: "c", options: { rounds: 2 }, random: createRandom(1), services })) };
    const { start, act, ok, code, view } = harness("truth_or_dare", truthOrDare, options);
    let session = start();
    const first = session.state.current;
    const second = first === A ? B : A;
    expect(code(act(session, second, "choose", { kind: "truth" }))).toBe("not_your_turn");
    session = ok(act(session, first, "choose", { kind: "dare" }));
    expect(view(session, second).prompt).toMatchObject({ kind: "dare", text: DARE_PROMPTS[0].text });
    expect(code(act(session, first, "react", { emoji: "🔥" }))).toBe("illegal_action"); // not your own
    session = ok(act(session, second, "react", { emoji: "🔥" }));
    session = ok(act(session, first, "done"));
    expect(session.state.current).toBe(second);
    session = ok(act(session, second, "choose", { kind: "truth" }));
    session = ok(act(session, second, "chicken"));
    expect(session.result).toMatchObject({ outcome: "completed" });
    expect(session.state.tally[second].chicken).toBe(1);
    expect(session.state.tally[first].dare).toBe(1);
  });

  it("Question Roulette: the server decides where it lands; the question shows only after the spin", async () => {
    const options = { rounds: 3, ...(await roulette.prepare({ coupleId: "c", options: { rounds: 3 }, random: createRandom(5), services })) };
    expect(options.spins).toHaveLength(3);
    for (const spin of options.spins) expect(SEGMENTS[spin.segment]).toBe(spin.level);
    const { start, act, ok, code, view } = harness("question_roulette", roulette, options);
    let session = start();
    const spinner = session.state.current;
    const other = spinner === A ? B : A;
    expect(view(session, other).prompt).toBeNull(); // nothing before the spin
    expect(code(act(session, other, "spin"))).toBe("not_your_turn");
    session = ok(act(session, spinner, "spin"));
    expect(view(session, other)).toMatchObject({ level: options.spins[0].level, prompt: options.spins[0].prompt });
    session = ok(act(session, other, "react", { emoji: "😳" }));
    session = ok(act(session, spinner, "answered"));
    expect(session.state.current).toBe(other);
    session = ok(act(session, other, "spin"));
    session = ok(act(session, other, "pass"));
    session = ok(act(session, spinner, "spin"));
    session = ok(act(session, spinner, "answered"));
    expect(session.result).toMatchObject({ outcome: "completed" });
    expect(session.state.passed[other]).toBe(1);
  });

  it("Would You Rather — Spicy draws from its own bank", async () => {
    const options = await spicyWyr.prepare({ coupleId: "c", options: { rounds: 2 }, random: createRandom(1), services });
    expect(options.questions.map((q) => q.id)).toEqual(["wyrs-001", "wyrs-002"]);
  });
});
