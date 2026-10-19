import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import { countsTowardWinStreak } from "@/lib/game/result";
import { DISTRIBUTION, LETTER_VALUES, SIZE, allTiles, premiumAt } from "./board";
import { isWord } from "./dictionary";
import rules, { evaluatePlacement } from "./rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("scrabble");

const act = (session, playerId, type, payload = {}) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(9), now: 1 });
const ok = (result) => {
  expect(result.error).toBeUndefined();
  return result.session;
};
const code = (result) => result.error?.code;
const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });

let tileCounter = 0;
const tiles = (letters) => [...letters].map((letter) => ({ id: `t${(tileCounter += 1)}`, letter }));
/** A game with chosen racks and board (A to play). */
function table({ a = "CATSDOG", b = "EEEEEEE", board = {}, bag, scores, ...extra } = {}) {
  const session = createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(1), now: 0 });
  return {
    ...session,
    state: {
      ...session.state,
      racks: { [A]: typeof a === "string" ? tiles(a) : a, [B]: typeof b === "string" ? tiles(b) : b },
      board,
      bag: bag ?? tiles("AEIOURSTLNAEIOURSTLN"),
      scores: scores ?? { [A]: 0, [B]: 0 },
      current: A,
      turn: 1,
      ...extra,
    },
  };
}
/** Places letters from A's rack: spec = [[letter, row, col], …]. */
function place(session, playerId, spec, blankLetters = {}) {
  const rack = [...session.state.racks[playerId]];
  const placed = spec.map(([letter, row, col]) => {
    const index = rack.findIndex((tile) => tile.letter === letter);
    const [tile] = rack.splice(index, 1);
    return { id: tile.id, row, col, ...(tile.letter === "?" ? { letter: blankLetters[`${row},${col}`] } : {}) };
  });
  return act(session, playerId, "place", { tiles: placed, turn: session.state.turn });
}
const board = (...words) => {
  // words: [word, row, col, "across"|"down"]
  const result = {};
  for (const [word, row, col, dir] of words) [...word].forEach((letter, i) => (result[dir === "down" ? `${row + i},${col}` : `${row},${col + i}`] = { letter, blank: false, by: A }));
  return result;
};

describe("tiles and board", () => {
  it("100 tiles with the standard distribution, 2 blanks", () => {
    expect(allTiles()).toHaveLength(100);
    expect(Object.values(DISTRIBUTION).reduce((a, b) => a + b, 0)).toBe(100);
    expect(allTiles().filter((t) => t.letter === "?")).toHaveLength(2);
    expect([LETTER_VALUES.Q, LETTER_VALUES.Z, LETTER_VALUES.E, LETTER_VALUES.K]).toEqual([10, 10, 1, 5]);
  });

  it("the standard premium layout: 8 TW, 17 DW (incl. centre), 12 TL, 24 DL", () => {
    const counts = { TW: 0, DW: 0, TL: 0, DL: 0 };
    for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) if (premiumAt(r, c)) counts[premiumAt(r, c)] += 1;
    expect(counts).toEqual({ TW: 8, DW: 17, TL: 12, DL: 24 });
    expect(premiumAt(7, 7)).toBe("DW");
    expect(premiumAt(0, 0)).toBe("TW");
  });

  it("the word list knows real words and refuses nonsense", () => {
    expect(isWord("cat")).toBe(true);
    expect(isWord("QUIXOTIC")).toBe(true);
    expect(isWord("xqzt")).toBe(false);
  });
});

describe("setup and privacy", () => {
  it("deals 7 each from a shuffled bag; a player sees their own rack only, and never the bag's order", () => {
    const session = createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(4), now: 0 });
    expect(session.state.racks[A]).toHaveLength(7);
    expect(session.state.racks[B]).toHaveLength(7);
    expect(session.state.bag).toHaveLength(86);
    const mine = view(session, A);
    expect(mine.rack).toEqual(session.state.racks[A]);
    expect(mine.partnerTiles).toBe(7);
    expect(mine.partnerRack).toBeNull();
    expect(mine).not.toHaveProperty("bag");
    expect(mine.bagCount).toBe(86);
    expect(JSON.stringify(mine)).not.toContain(session.state.racks[B][0].id);
  });
});

describe("placement rules", () => {
  it("the first word must cover the centre and be 2+ letters", () => {
    const session = table();
    expect(code(place(session, A, [["C", 0, 0], ["A", 0, 1], ["T", 0, 2]]))).toBe("illegal_action");
    expect(code(place(session, A, [["C", 7, 7]]))).toBe("illegal_action");
    const played = ok(place(session, A, [["C", 7, 6], ["A", 7, 7], ["T", 7, 8]]));
    // CAT across through the DW centre: (3 + 1 + 1) × 2 = 10
    expect(played.state.moves.at(-1)).toMatchObject({ words: [{ word: "CAT", score: 10 }], score: 10 });
    expect(played.state.scores[A]).toBe(10);
    expect(played.state.racks[A]).toHaveLength(7); // refilled
    expect(played.state.current).toBe(B);
  });

  it("tiles must be in one line, without gaps, and connect to the board", () => {
    const session = table({ board: board(["CAT", 7, 6, "across"]) });
    expect(code(place(session, A, [["D", 3, 3], ["O", 4, 4]]))).toBe("illegal_action"); // diagonal
    expect(code(place(session, A, [["D", 2, 2], ["O", 2, 4]]))).toBe("illegal_action"); // gap
    expect(code(place(session, A, [["D", 2, 2], ["O", 2, 3], ["G", 2, 4]]))).toBe("illegal_action"); // floating
    expect(code(place(session, A, [["S", 7, 6]]))).toBe("illegal_action"); // occupied
  });

  it("extends a word with a single tile (CAT → CATS) and existing tiles fill gaps", () => {
    const session = table({ board: board(["CAT", 7, 6, "across"]) });
    const played = ok(place(session, A, [["S", 7, 9]]));
    expect(played.state.moves.at(-1).words).toEqual([{ word: "CATS", score: 6 }]); // no premium on (7,9)
  });

  it("crosswords count; every word formed must be real", () => {
    // O under the T of CAT makes TO (down).
    const session = table({ board: board(["CAT", 7, 6, "across"]) });
    const played = ok(place(session, A, [["O", 8, 8]]));
    expect(played.state.moves.at(-1).words.map((w) => w.word)).toEqual(["TO"]);
    // A play that makes a bad crossword is refused with the words named.
    const bad = place(table({ board: board(["CAT", 7, 6, "across"]), a: "GGGGGGG" }), A, [["G", 8, 6], ["G", 8, 7]]);
    expect(code(bad)).toBe("invalid_word");
    expect(bad.error.message).toMatch(/isn't|aren't/);
  });

  it("letter premiums count once, on new tiles; word premiums multiply each word they're in", () => {
    const anyWord = { checkWord: () => true };
    // DOGS across from the TW corner (0,0); a DL sits at (0,3). The X below D makes the crossword DX.
    const first = evaluatePlacement(
      board(["X", 1, 0, "across"]),
      [
        { row: 0, col: 0, letter: "D", blank: false },
        { row: 0, col: 1, letter: "O", blank: false },
        { row: 0, col: 2, letter: "G", blank: false },
        { row: 0, col: 3, letter: "S", blank: false },
      ],
      anyWord,
    );
    // DOGS: (2 + 1 + 2 + 1×2) × 3 = 21 · DX: (2 + 8) × 3 = 30 (the TW counts for both words).
    expect(first.words).toEqual([
      { word: "DOGS", score: 21 },
      { word: "DX", score: 30 },
    ]);
    // Extending later: the premiums under existing tiles don't count again.
    const later = evaluatePlacement(board(["DOGS", 0, 0, "across"]), [{ row: 0, col: 4, letter: "Y", blank: false }], anyWord);
    expect(later.words).toEqual([{ word: "DOGSY", score: 2 + 1 + 2 + 1 + 4 }]);
  });

  it("blank tiles take the chosen letter and score zero", () => {
    const session = table({ a: tiles("C?T") });
    expect(code(place(session, A, [["C", 7, 6], ["?", 7, 7], ["T", 7, 8]]))).toBe("choose_letter");
    const played = ok(place(session, A, [["C", 7, 6], ["?", 7, 7], ["T", 7, 8]], { "7,7": "A" }));
    expect(played.state.board["7,7"]).toMatchObject({ letter: "A", blank: true });
    expect(played.state.moves.at(-1).score).toBe((3 + 0 + 1) * 2);
  });

  it("using all seven tiles earns the 50-point bingo", () => {
    const session = table({ a: "RETAINS" });
    const played = ok(place(session, A, [["R", 7, 4], ["E", 7, 5], ["T", 7, 6], ["A", 7, 7], ["I", 7, 8], ["N", 7, 9], ["S", 7, 10]]));
    const move = played.state.moves.at(-1);
    expect(move.bingo).toBe(true);
    expect(move.score).toBe((1 + 1 + 1 + 1 + 1 + 1 + 1) * 2 + 50);
  });

  it("refuses tiles the player doesn't own, and out-of-turn or repeated moves", () => {
    const session = table();
    expect(code(act(session, A, "place", { tiles: [{ id: "not-mine", row: 7, col: 7 }], turn: 1 }))).toBe("illegal_action");
    expect(code(place(session, B, [["E", 7, 7], ["E", 7, 8]]))).toBe("not_your_turn");
    const once = ok(place(session, A, [["C", 7, 6], ["A", 7, 7], ["T", 7, 8]]));
    expect(code(act(once, A, "pass", { turn: 1 }))).toBe("already_played");
  });
});

describe("exchange, pass and the end", () => {
  it("exchanging swaps tiles with the bag and scores nothing; needs 7+ in the bag", () => {
    const session = table();
    const ids = session.state.racks[A].slice(0, 3).map((t) => t.id);
    const swapped = ok(act(session, A, "exchange", { ids, turn: 1 }));
    expect(swapped.state.racks[A]).toHaveLength(7);
    expect(swapped.state.racks[A].map((t) => t.id)).not.toContain(ids[0]);
    expect(swapped.state.bag).toHaveLength(20);
    expect(swapped.state.scoreless).toBe(1);
    expect(code(act(table({ bag: tiles("AEIOU") }), A, "exchange", { ids, turn: 1 }))).toBe("illegal_action");
  });

  it("six scoreless turns end the game; each player loses their rack's value", () => {
    let session = table({ a: "QZ", b: "EE" });
    for (let i = 0; i < 6; i += 1) session = ok(act(session, session.state.current, "pass", { turn: session.state.turn }));
    expect(session.status).toBe("completed");
    expect(session.result).toMatchObject({ outcome: "win", winnerId: B, scores: { [A]: -20, [B]: -2 } });
  });

  it("going out with the bag empty: the partner's rack value moves to you", () => {
    const session = table({ a: "AT", b: "QE", bag: [], board: board(["C", 7, 7, "across"]), scores: { [A]: 10, [B]: 12 } });
    const done = ok(place(session, A, [["A", 7, 8], ["T", 7, 9]]));
    // CAT across (C existing at centre): A(7,8)=1, T(7,9)=1 → 3+1+1 = 5. Then +11 from B's Q+E.
    expect(done.status).toBe("completed");
    expect(done.result).toMatchObject({ outcome: "win", winnerId: A, scores: { [A]: 10 + 5 + 11, [B]: 12 - 11 } });
    expect(countsTowardWinStreak(definition, done.result)).toBe(true);
    expect(view(done, A).partnerRack.map((t) => t.letter).sort()).toEqual(["E", "Q"]);
  });

  it("resigning gives the partner the win", () => {
    const done = ok(act(table(), A, "resign"));
    expect(done.result).toMatchObject({ outcome: "win", winnerId: B });
  });
});
