import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import { countsTowardWinStreak } from "@/lib/game/result";
import { HOME, TRACK_LENGTH, YARD, squareOf, zoneOf } from "./board";
import rules, { getMoveOptions, hop } from "./rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("ludo");

/** The server's dice for a test: returns the given values in order. */
const dice = (...values) => {
  const queue = [...values];
  return { int: () => queue.shift(), next: () => 0, pick: (items) => items[0], shuffle: (items) => [...items] };
};
/** Seat B progress for absolute square `square` (B starts on square 26). */
const b = (square) => (square - 26 + TRACK_LENGTH) % TRACK_LENGTH;

function start(seed = 1) {
  return createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(seed), now: 0 });
}
/** A session with A to play and the given pieces placed (everything else in the yard). */
function withBoard(pieces = {}, extra = {}) {
  const session = start();
  return { ...session, state: { ...session.state, current: A, ...extra, pieces: { ...session.state.pieces, ...pieces } } };
}
const act = (session, playerId, type, payload = {}, random = dice()) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random, now: 1 });
const roll = (session, values, playerId = A) => act(session, playerId, "roll", {}, dice(...values));
const move = (session, pieceId, use, playerId = A) => act(session, playerId, "move", { pieceId, use });
const ok = (result) => {
  expect(result.error).toBeUndefined();
  return result.session;
};
const codeOf = (result) => result.error?.code;
const options = (session) => getMoveOptions(session.state).map((o) => `${o.pieceId}:${o.use}`);
const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(9), now: 2 });

describe("board model", () => {
  it("progress → zones and absolute squares; seats start opposite each other", () => {
    expect([zoneOf(YARD), zoneOf(0), zoneOf(50), zoneOf(51), zoneOf(HOME)]).toEqual(["yard", "track", "track", "lane", "home"]);
    expect(squareOf(0, 0)).toBe(0);
    expect(squareOf(1, 0)).toBe(26);
    expect(squareOf(1, b(15))).toBe(15);
    expect(squareOf(0, 51)).toBeNull(); // home lanes are private
  });
});

describe("setup", () => {
  it("two players, four pieces each in the yard, awaiting the first roll", () => {
    const { state } = start();
    expect(state.seats).toEqual([A, B]);
    expect(Object.keys(state.pieces)).toEqual(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]);
    expect(Object.values(state.pieces).every((p) => p === YARD)).toBe(true);
    expect(state).toMatchObject({ phase: "awaiting_roll", dice: null, doubleSixes: 0, bonus: [], winnerId: null });
  });

  it("the starting player comes from the server's random", () => {
    expect(new Set(Array.from({ length: 20 }, (_, seed) => start(seed).state.current))).toEqual(new Set([A, B]));
  });
});

describe("two dice", () => {
  it("rolls two server dice (1–6); dice in the payload are ignored", () => {
    const rolled = ok(act(withBoard({ A1: 10 }), A, "roll", { dieA: 6, dieB: 6, values: [6, 6] }, dice(3, 5)));
    expect(rolled.state.dice).toEqual([
      { value: 3, used: false },
      { value: 5, used: false },
    ]);
    expect(rolled.state.lastRoll).toMatchObject({ by: A, values: [3, 5], doubleSix: false });
    const seeded = ok(act(withBoard({ A1: 10 }), A, "roll", {}, createRandom(4)));
    for (const die of seeded.state.dice) expect(die.value >= 1 && die.value <= 6).toBe(true);
  });

  it("recognises a double six; other doubles are not", () => {
    expect(ok(roll(withBoard({ A1: 10 }), [6, 6])).state).toMatchObject({ doubleSixes: 1, bonus: ["double_six"], lastRoll: { doubleSix: true } });
    expect(ok(roll(withBoard({ A1: 10 }), [5, 5])).state).toMatchObject({ doubleSixes: 0, bonus: [], lastRoll: { doubleSix: false } });
  });

  it("only the current player rolls, once per throw", () => {
    const session = withBoard({ A1: 10 });
    expect(codeOf(roll(session, [1, 2], B))).toBe("not_your_turn");
    const rolled = ok(roll(session, [1, 2]));
    expect(codeOf(roll(rolled, [3, 4]))).toBe("already_rolled");
    expect(rolled.state.dice.map((d) => d.value)).toEqual([1, 2]);
  });

  it("no usable die: the roll is shown, both dice are forfeited, the turn passes", () => {
    const passed = ok(roll(withBoard(), [3, 4]));
    expect(passed.state).toMatchObject({ phase: "awaiting_roll", current: B, forfeited: [3, 4], lastRoll: { outcome: "no_move" } });
    expect(view(passed, A).options).toEqual([]);
    expect(codeOf(roll(passed, [1, 1]))).toBe("already_rolled"); // a repeated tap stays quiet
  });
});

describe("leaving the yard", () => {
  it("a 6 can bring a piece out — or move a piece already out instead", () => {
    const rolled = ok(roll(withBoard({ A1: 10 }), [6, 3]));
    expect(options(rolled)).toEqual(expect.arrayContaining(["A1:die0", "A1:die1", "A1:both", "A2:die0", "A2:both"]));
    expect(options(rolled)).not.toContain("A2:die1"); // a 3 can't bring a piece out
    const out = ok(move(rolled, "A2", "die0"));
    expect(out.state.pieces.A2).toBe(0);
    const instead = ok(move(rolled, "A1", "die0"));
    expect(instead.state.pieces).toMatchObject({ A1: 16, A2: YARD });
  });

  it("the other die can then move the piece that just came out, or another one", () => {
    const out = ok(move(ok(roll(withBoard({ A1: 10 }), [6, 3])), "A2", "die0"));
    expect(out.state.dice).toEqual([
      { value: 6, used: true },
      { value: 3, used: false },
    ]);
    expect(ok(move(out, "A2", "die1")).state.pieces.A2).toBe(3);
    expect(ok(move(out, "A1", "die1")).state.pieces.A1).toBe(13);
  });

  it("out and on in one go: combined 6 + 3 from the yard lands on progress 3", () => {
    const moved = ok(move(ok(roll(withBoard(), [3, 6])), "A1", "both"));
    expect(moved.state.pieces.A1).toBe(3);
    expect(moved.state.lastMove).toMatchObject({ enters: true, values: [6, 3], hops: [0, 1, 2, 3] });
  });

  it("double six can bring two pieces out, then earns another roll of both dice", () => {
    let session = ok(roll(withBoard(), [6, 6]));
    session = ok(move(session, "A1", "die0"));
    session = ok(move(session, "A2", "die1"));
    expect(session.state.pieces).toMatchObject({ A1: 0, A2: 0 });
    expect(session.state).toMatchObject({ current: A, phase: "awaiting_roll", extraRoll: "double_six", dice: null });
    const again = ok(roll(session, [4, 2]));
    expect(again.state.dice.map((d) => d.value)).toEqual([4, 2]);
  });

  it("a 6 brings a piece out even onto an opponent on your start tile — a kill: it goes back, yours goes home", () => {
    const moved = ok(move(ok(roll(withBoard({ A2: 30, B1: b(0) }), [6, 2])), "A1", "die0"));
    expect(moved.state.pieces).toMatchObject({ A1: HOME, B1: YARD });
  });
});

describe("split and combine", () => {
  const twoOut = () => ok(roll(withBoard({ A1: 10, A2: 20 }), [3, 5]));

  it("split: A1 +3 and A2 +5 — or the other way round", () => {
    const one = ok(move(ok(move(twoOut(), "A1", "die0")), "A2", "die1"));
    expect(one.state.pieces).toMatchObject({ A1: 13, A2: 25 });
    const other = ok(move(ok(move(twoOut(), "A1", "die1")), "A2", "die0"));
    expect(other.state.pieces).toMatchObject({ A1: 15, A2: 23 });
    expect(other.state.current).toBe(B);
  });

  it("combine: one piece takes the 8", () => {
    const moved = ok(move(twoOut(), "A1", "both"));
    expect(moved.state.pieces).toMatchObject({ A1: 18, A2: 20 });
    expect(moved.state.lastMove).toMatchObject({ values: [3, 5], hops: [11, 12, 13, 14, 15, 16, 17, 18] });
    expect(moved.state.current).toBe(B); // both dice spent
  });

  it("with only one piece out, the full 5 + 3 can go to it", () => {
    const rolled = ok(roll(withBoard({ A1: 10 }), [5, 3]));
    expect(options(rolled)).toContain("A1:both");
    expect(ok(move(rolled, "A1", "both")).state.pieces.A1).toBe(18);
  });

  it("remaining dice: after the 3 only the 5 is left; a spent die can't be reused", () => {
    const afterThree = ok(move(twoOut(), "A1", "die0"));
    expect(afterThree.state.dice).toEqual([
      { value: 3, used: true },
      { value: 5, used: false },
    ]);
    expect(options(afterThree)).toEqual(["A1:die1", "A2:die1"]);
    expect(codeOf(move(afterThree, "A2", "die0"))).toBe("illegal_action");
    expect(codeOf(move(afterThree, "A2", "both"))).toBe("illegal_action");
    const done = ok(move(afterThree, "A2", "die1"));
    expect(done.state).toMatchObject({ dice: null, current: B });
  });
});

describe("no houses or barriers (Naija Ludo)", () => {
  const pair = { B1: b(14), B2: b(14) };

  it("own pieces may share a square", () => {
    const moved = ok(move(ok(roll(withBoard({ A1: 10, A2: 12 }), [2, 1])), "A1", "die0"));
    expect(moved.state.pieces).toMatchObject({ A1: 12, A2: 12 });
  });

  it("two opponent pieces on a square don't block: passing is fine, landing kills both", () => {
    const rolled = ok(roll(withBoard({ A1: 10, A2: 30, ...pair }), [4, 5]));
    expect(hop(rolled.state, 0, 10, 5)).toEqual({ to: 15, path: [11, 12, 13, 14, 15] });
    const killed = ok(move(rolled, "A1", "die0"));
    expect(killed.state.pieces).toMatchObject({ A1: HOME, B1: YARD, B2: YARD });
    expect(killed.state.captures[A]).toBe(2);
  });
});

describe("kills", () => {
  it("landing exactly on a lone opponent sends it to the yard and the killer home — no bonus roll", () => {
    let session = ok(roll(withBoard({ A1: 10, A2: 30, B1: b(15) }), [5, 2]));
    session = ok(move(session, "A1", "die0"));
    expect(session.state.pieces).toMatchObject({ A1: HOME, B1: YARD });
    expect(session.state.lastMove).toMatchObject({ to: 15, home: true, captured: [{ pieceId: "B1", from: b(15) }] });
    expect(session.state.captures[A]).toBe(1);
    expect(session.state.bonus).toEqual([]);
    session = ok(move(session, "A2", "die1"));
    expect(session.state).toMatchObject({ current: B, phase: "awaiting_roll", extraRoll: null });
  });

  it("a kill that brings the last piece home wins", () => {
    const won = ok(move(ok(roll(withBoard({ A1: 10, A2: HOME, A3: HOME, A4: HOME, B1: b(15) }), [5, 2])), "A1", "die0"));
    expect(won.state).toMatchObject({ phase: "finished", winnerId: A });
  });

  it("a kill works with combined dice too; passing over a lone piece doesn't kill", () => {
    const moved = ok(move(ok(roll(withBoard({ A1: 10, B1: b(12), B2: b(18) }), [3, 5])), "A1", "both"));
    expect(moved.state.pieces).toMatchObject({ A1: HOME, B1: b(12), B2: YARD });
    const short = ok(move(ok(roll(withBoard({ A1: 10, A2: 30, B1: b(15) }), [4, 2])), "A1", "die0"));
    expect(short.state.pieces.B1).toBe(b(15));
    expect(short.state.bonus).toEqual([]);
  });

  it("there are no safe squares: start tiles and stars can be killed on", () => {
    const moved = ok(move(ok(roll(withBoard({ A1: 5, A2: 30, B1: b(8) }), [3, 1])), "A1", "die0"));
    expect(moved.state.pieces).toMatchObject({ A1: HOME, B1: YARD });
    const onStart = ok(move(ok(roll(withBoard({ A1: 20, A2: 30, B1: b(26) }), [6, 1])), "A1", "die0"));
    expect(onStart.state.pieces).toMatchObject({ A1: HOME, B1: YARD });
  });

  it("a client can't claim a kill or a bonus", () => {
    const moved = ok(act(ok(roll(withBoard({ A1: 10, A2: 30, B1: b(20) }), [2, 1])), A, "move", { pieceId: "A1", use: "die0", captures: ["B1"], bonus: true, extraRoll: "capture" }));
    expect(moved.state.pieces.B1).toBe(b(20));
    expect(moved.state.bonus).toEqual([]);
  });
});

describe("home", () => {
  it("exact count: a single die can take a piece home, the other die moves another piece", () => {
    let session = ok(roll(withBoard({ A1: 53, A2: 10 }), [3, 4]));
    expect(options(session)).not.toContain("A1:die1"); // 53 + 4 overshoots
    expect(options(session)).not.toContain("A1:both");
    session = ok(move(session, "A1", "die0"));
    expect(session.state.pieces.A1).toBe(HOME);
    expect(session.state.lastMove.home).toBe(true);
    session = ok(move(session, "A2", "die1"));
    expect(session.state.pieces.A2).toBe(14);
  });

  it("a die nobody can use after a move is forfeited and the turn resolves", () => {
    const session = ok(move(ok(roll(withBoard({ A1: 54 }), [2, 5])), "A1", "die0"));
    expect(session.state).toMatchObject({ current: B, forfeited: [5] });
  });

  it("three pieces home isn't a win; the fourth is", () => {
    const three = { A1: HOME, A2: HOME, A3: HOME };
    const notYet = ok(move(ok(roll(withBoard({ ...three, A4: 30 }), [2, 1])), "A4", "die0"));
    expect(notYet.status).toBe("active");
    const won = ok(move(ok(roll(withBoard({ ...three, A4: 54 }), [2, 1])), "A4", "die0"));
    expect(won.status).toBe("completed");
    expect(won.result).toMatchObject({ outcome: "win", winnerId: A, scores: null, summary: { headline: "Home Sweet Home 🏆" } });
    expect(countsTowardWinStreak(definition, won.result)).toBe(true);
    expect(codeOf(roll(won, [1, 1], B))).toBe("session_not_active");
  });

  it("a client-claimed winner is ignored", () => {
    const moved = ok(act(ok(roll(withBoard({ A1: 10 }), [2, 1])), A, "move", { pieceId: "A1", use: "both", winnerId: A, to: HOME }));
    expect(moved.status).toBe("active");
    expect(moved.state.pieces.A1).toBe(13);
  });
});

describe("double sixes", () => {
  const playBoth = (session) => ok(move(session, "A1", "both"));

  it("consecutive double sixes are counted; each earns a roll of two fresh dice", () => {
    let session = playBoth(ok(roll(withBoard({ A1: 0 }), [6, 6])));
    expect(session.state).toMatchObject({ current: A, phase: "awaiting_roll", doubleSixes: 1 });
    session = playBoth(ok(roll(session, [6, 6])));
    expect(session.state).toMatchObject({ current: A, doubleSixes: 2, pieces: expect.objectContaining({ A1: 24 }) });
    session = playBoth(ok(roll(session, [4, 2])));
    expect(session.state).toMatchObject({ current: B, doubleSixes: 0 });
  });

  it("double sixes keep earning rolls — no limit", () => {
    let session = withBoard({ A1: 0 });
    for (let i = 1; i <= 4; i += 1) {
      session = playBoth(ok(roll(session, [6, 6])));
      expect(session.state).toMatchObject({ current: A, extraRoll: "double_six", doubleSixes: i });
    }
  });

  it("a double six plus a kill earns just the double six's roll", () => {
    let session = ok(roll(withBoard({ A1: 0, A2: 20, B1: b(6) }), [6, 6]));
    session = ok(move(session, "A1", "die0")); // kills B1 on square 6, A1 goes home
    session = ok(move(session, "A2", "die1"));
    expect(session.state).toMatchObject({ current: A, extraRoll: "double_six", bonus: [], pieces: expect.objectContaining({ A1: HOME }) });
    session = ok(move(ok(roll(session, [1, 2])), "A2", "both"));
    expect(session.state.current).toBe(B);
  });
});

describe("invalid and repeated actions", () => {
  it("rejects wrong phase, wrong player, other pieces and nonsense", () => {
    const session = withBoard({ A1: 10 });
    expect(codeOf(move(session, "A1", "die0"))).toBe("roll_first");
    const rolled = ok(roll(session, [3, 2]));
    expect(codeOf(move(rolled, "B1", "die0", B))).toBe("not_your_turn");
    expect(codeOf(move(rolled, "B1", "die0"))).toBe("illegal_action");
    expect(codeOf(move(rolled, "A2", "die0"))).toBe("illegal_action"); // in the yard, no 6
    expect(codeOf(move(rolled, "A1", "die9"))).toBe("malformed_action");
    expect(codeOf(move(rolled, "Z1", "die0"))).toBe("malformed_action");
    expect(codeOf(act(rolled, A, "teleport"))).toBe("malformed_action");
    expect(codeOf(act(rolled, "intruder", "roll"))).toBe("not_a_player");
  });

  it("the same move twice is applied once", () => {
    const rolled = ok(roll(withBoard({ A1: 10, A2: 20 }), [3, 5]));
    const once = ok(move(rolled, "A1", "die0"));
    expect(codeOf(move(once, "A1", "die0"))).toBe("already_moved");
    const done = ok(move(once, "A2", "die1"));
    expect(codeOf(move(done, "A2", "die1"))).toBe("already_moved");
    expect(done.state.pieces).toMatchObject({ A1: 13, A2: 25 });
  });

  it("the view lists the server's options (equal dice once) and hides nothing else", () => {
    const rolled = ok(roll(withBoard({ A1: 10 }), [4, 4]));
    const forB = view(rolled, B);
    expect(forB).toMatchObject({ current: A, phase: "awaiting_move", mySeat: 1 });
    expect(forB.options.map((o) => `${o.pieceId}:${o.use}`)).toEqual(["A1:die0", "A1:both"]);
    expect(forB).not.toHaveProperty("seed");
  });
});

describe("whole games", () => {
  it("seeded server dice always reach exactly one winner with all four home", () => {
    for (const seed of [1, 2, 3]) {
      let session = start(seed);
      const random = createRandom(seed * 101);
      for (let step = 0; step < 20000 && session.status === "active"; step += 1) {
        const { state } = session;
        const choice = state.phase === "awaiting_move" ? getMoveOptions(state).at(-1) : null;
        const action = choice ? { type: "move", payload: { pieceId: choice.pieceId, use: choice.use } } : { type: "roll", payload: {} };
        session = ok(applyPlayerAction(session, { ...action, playerId: state.current }, { definition, rules, random, now: step }));
      }
      expect(session.status).toBe("completed");
      const letter = session.state.seats.indexOf(session.result.winnerId) === 0 ? "A" : "B";
      expect(["1", "2", "3", "4"].every((n) => session.state.pieces[letter + n] === HOME)).toBe(true);
    }
  });
});
