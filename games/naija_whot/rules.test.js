import { describe, expect, it } from "vitest";
import { gameRegistry } from "@/lib/game/catalog";
import { applyPlayerAction, createSession, getPlayerView } from "@/lib/game/engine";
import { createRandom } from "@/lib/game/random";
import { countsTowardWinStreak } from "@/lib/game/result";
import { DECK, cardPoints, parseCard } from "./cards";
import rules, { DEAL, canPlay } from "./rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const definition = gameRegistry.get("naija_whot");

const act = (session, playerId, type, payload = {}, seed = 5) => applyPlayerAction(session, { type, payload, playerId }, { definition, rules, random: createRandom(seed), now: 1 });
const ok = (result) => {
  expect(result.error).toBeUndefined();
  return result.session;
};
const code = (result) => result.error?.code;
const view = (session, playerId) => getPlayerView(session, playerId, { rules, random: createRandom(3), now: 2 });

function fresh(seed = 1) {
  return createSession({ id: "s", definition, rules, coupleId: "c", playerIds: [A, B], random: createRandom(seed), now: 0 });
}
/** A dealt game with exactly these hands, call card and market (A to play). */
function table({ a, b, top, market = ["circle-3", "square-7", "triangle-4", "cross-11", "star-2", "circle-12"], settings = {}, ...extra }) {
  const session = fresh();
  return {
    ...session,
    state: {
      ...session.state,
      phase: "playing",
      settings: { ...session.state.settings, ...settings },
      hands: { [A]: a, [B]: b },
      pile: [top],
      market,
      current: A,
      turn: 1,
      ...extra,
    },
  };
}
const play = (session, playerId, cardId, shape) => act(session, playerId, "play", { cardId, shape, turn: session.state.turn });
const market = (session, playerId) => act(session, playerId, "market", { turn: session.state.turn });

describe("the deck", () => {
  it("is the 54-card Nigerian pack: 12 circles, 12 triangles, 9 crosses, 9 squares, 7 stars, 5 Whot", () => {
    expect(DECK).toHaveLength(54);
    expect(new Set(DECK).size).toBe(54);
    const count = (shape) => DECK.filter((id) => parseCard(id).shape === shape).length;
    expect([count("circle"), count("triangle"), count("cross"), count("square"), count("star"), count("whot")]).toEqual([12, 12, 9, 9, 7, 5]);
    expect(DECK).not.toContain("cross-4");
    expect(DECK).not.toContain("star-10");
  });

  it("counts face value, stars double, Whot 20", () => {
    expect(cardPoints("circle-13")).toBe(13);
    expect(cardPoints("star-7")).toBe(14);
    expect(cardPoints("whot-20-a")).toBe(20);
  });
});

describe("settings and the deal", () => {
  it("either player can change settings before the deal; the server shuffles and deals 6 each", () => {
    let session = fresh();
    expect(session.state.phase).toBe("settings");
    session = ok(act(session, B, "settings", { key: "pickThree", value: false }));
    session = ok(act(session, A, "settings", { key: "tender", value: "reshuffle" }));
    expect(code(act(session, A, "settings", { key: "tender", value: "maybe" }))).toBe("malformed_action");
    session = ok(act(session, A, "deal"));
    expect(session.state.settings).toMatchObject({ pickThree: false, tender: "reshuffle", pickTwo: true });
    expect(session.state.hands[A]).toHaveLength(DEAL);
    expect(session.state.hands[B]).toHaveLength(DEAL);
    const all = [...session.state.hands[A], ...session.state.hands[B], ...session.state.pile, ...session.state.market];
    expect(all.sort()).toEqual([...DECK].sort()); // every card exactly once
    expect(parseCard(session.state.pile[0]).shape).not.toBe("whot"); // the call card is never a Whot
    expect(code(act(session, A, "deal"))).toBe("already_dealt");
    expect(code(act(session, A, "settings", { key: "pickTwo", value: false }))).toBe("already_dealt");
  });

  it("different seeds shuffle differently", () => {
    const deal = (seed) => ok(act(fresh(), A, "deal", {}, seed)).state.hands[A].join();
    expect(deal(1)).not.toBe(deal(2));
  });
});

describe("privacy", () => {
  it("a player sees their own hand and only the size of their partner's — never the market", () => {
    const session = ok(act(fresh(), A, "deal"));
    const mine = view(session, A);
    expect(mine.hand).toEqual(session.state.hands[A]);
    expect(mine.partnerCount).toBe(6);
    expect(mine.partnerHand).toBeNull();
    expect(JSON.stringify(mine)).not.toContain(session.state.hands[B][0]);
    expect(mine).not.toHaveProperty("market");
    expect(mine.marketCount).toBe(session.state.market.length);
  });
});

describe("playing cards", () => {
  it("match shape or number; anything else is refused", () => {
    const session = table({ a: ["circle-7", "square-3", "triangle-10"], b: ["star-1"], top: "square-7" });
    expect(canPlay(session.state, "circle-7")).toBe(true); // number
    expect(canPlay(session.state, "square-3")).toBe(true); // shape
    expect(code(play(session, A, "triangle-10"))).toBe("illegal_action");
    expect(code(play(session, A, "star-1"))).toBe("illegal_action"); // not in hand
    expect(code(play(session, B, "star-1"))).toBe("not_your_turn");
    const next = ok(play(session, A, "circle-7"));
    expect(next.state.current).toBe(B);
    expect(next.state.pile.at(-1)).toBe("circle-7");
  });

  it("a resend of the same move is refused, never applied twice", () => {
    const session = table({ a: ["circle-7", "square-3"], b: ["star-1"], top: "square-7" });
    const once = ok(play(session, A, "circle-7"));
    expect(code(act(once, A, "play", { cardId: "square-3", turn: 1 }))).toBe("already_played");
  });

  it("Whot is wild and names the shape; the partner must follow it (or Whot)", () => {
    let session = table({ a: ["whot-20-a", "circle-4"], b: ["star-3", "circle-9x", "square-3", "whot-20-b"].filter((id) => DECK.includes(id)), top: "triangle-12" });
    expect(code(play(session, A, "whot-20-a"))).toBe("choose_shape");
    session = ok(play(session, A, "whot-20-a", "star"));
    expect(view(session, B).requestedShape).toBe("star");
    expect(code(play(session, B, "square-3"))).toBe("illegal_action"); // a 3, but not a star
    expect(view(session, B).playable.sort()).toEqual(["star-3", "whot-20-b"]);
    session = ok(play(session, B, "star-3"));
    expect(session.state.requestedShape).toBeNull();
  });
});

describe("special cards", () => {
  it("Hold On (1): play again", () => {
    const session = ok(play(table({ a: ["circle-1", "circle-5"], b: ["star-3"], top: "circle-10" }), A, "circle-1"));
    expect(session.state.current).toBe(A);
  });

  it("Suspension (8): the partner misses a turn — and switched off it's a normal 8", () => {
    expect(ok(play(table({ a: ["circle-8", "circle-5"], b: ["star-3"], top: "circle-10" }), A, "circle-8")).state.current).toBe(A);
    expect(ok(play(table({ a: ["circle-8", "circle-5"], b: ["star-3"], top: "circle-10", settings: { suspension: false } }), A, "circle-8")).state.current).toBe(B);
  });

  it("General Market (14): the partner picks one, and you play again", () => {
    const session = ok(play(table({ a: ["circle-14", "circle-5"], b: ["star-3"], top: "circle-10" }), A, "circle-14"));
    expect(session.state.hands[B]).toHaveLength(2);
    expect(session.state.current).toBe(A);
  });

  it("Pick Two: picking 2 uses the partner's turn, so it comes back", () => {
    let session = ok(play(table({ a: ["circle-2", "circle-5"], b: ["star-3"], top: "circle-10" }), A, "circle-2"));
    expect(view(session, B).pending).toEqual({ number: 2, count: 2 });
    expect(view(session, B).playable).toEqual([]); // no 2 to block with
    session = ok(market(session, B));
    expect(session.state.hands[B]).toHaveLength(3);
    expect(session.state.current).toBe(A);
    expect(session.state.pending).toBeNull();
  });

  it("a 2 blocks a 2 and the pick grows (2 + 2 = pick 4); a 5 can't block a 2", () => {
    let session = ok(play(table({ a: ["circle-2", "circle-5", "square-4"], b: ["star-2", "triangle-5", "cross-3"], top: "circle-10" }), A, "circle-2"));
    expect(code(play(session, B, "triangle-5"))).toBe("illegal_action");
    session = ok(play(session, B, "star-2"));
    expect(session.state.pending).toEqual({ number: 2, count: 4 });
    expect(session.state.current).toBe(A);
    expect(code(play(session, A, "circle-5"))).toBe("illegal_action");
    session = ok(market(session, A));
    expect(session.state.hands[A]).toHaveLength(2 + 4);
    expect(session.state.current).toBe(B);
  });

  it("Pick Three is blocked only by a 5; switched off, a 5 is a normal card", () => {
    let session = ok(play(table({ a: ["circle-5", "circle-4"], b: ["triangle-5", "circle-2"], top: "circle-10" }), A, "circle-5"));
    expect(code(play(session, B, "circle-2"))).toBe("illegal_action");
    session = ok(play(session, B, "triangle-5"));
    expect(session.state.pending).toEqual({ number: 5, count: 6 });
    const off = ok(play(table({ a: ["circle-5", "circle-4"], b: ["triangle-5"], top: "circle-10", settings: { pickThree: false } }), A, "circle-5"));
    expect(off.state.pending).toBeNull();
    expect(off.state.current).toBe(B);
  });

  it("going to market without a penalty draws one and ends the turn", () => {
    const session = ok(market(table({ a: ["circle-5"], b: ["star-3"], top: "square-10" }), A));
    expect(session.state.hands[A]).toHaveLength(2);
    expect(session.state.current).toBe(B);
    expect(view(session, B).last).toMatchObject({ type: "market", by: A, count: 1 });
    expect(JSON.stringify(view(session, B).last)).not.toContain(session.state.hands[A][1]); // the drawn card stays secret
  });
});

describe("ending", () => {
  it("check up: playing your last card wins at once and counts toward streaks", () => {
    const session = ok(play(table({ a: ["circle-7"], b: ["star-3", "whot-20-a"], top: "circle-10" }), A, "circle-7"));
    expect(session.result).toMatchObject({ outcome: "win", winnerId: A, summary: { reason: "check_up" } });
    expect(countsTowardWinStreak(definition, session.result)).toBe(true);
  });

  it("a special as the last card still checks up", () => {
    const session = ok(play(table({ a: ["circle-2"], b: ["star-3"], top: "circle-10" }), A, "circle-2"));
    expect(session.result).toMatchObject({ outcome: "win", winnerId: A });
  });

  it("tender = count: when the market finishes, the lower total wins (stars double)", () => {
    // B draws the last market card; A holds star-7 (14) + circle-1 (1) = 15, B square-10 + circle-3 = 13.
    const session = ok(market(table({ a: ["star-7", "circle-1"], b: ["square-10"], top: "triangle-12", market: ["circle-3"], current: B }), B));
    expect(session.result).toMatchObject({ outcome: "win", winnerId: B, scores: { [A]: 15, [B]: 13 }, summary: { reason: "tender" } });
    expect(view(session, A).partnerHand).toEqual(["square-10", "circle-3"]); // hands are shown for the count
  });

  it("tender = count: equal totals are a draw", () => {
    const session = ok(market(table({ a: ["circle-10"], b: ["square-7"], top: "triangle-12", market: ["circle-3"], current: B }), B));
    expect(session.result).toMatchObject({ outcome: "draw" });
  });

  it("tender = reshuffle: the played cards (except the call card) become the new market", () => {
    const session = ok(market(table({ a: ["circle-10"], b: ["square-7"], top: "triangle-12", market: [], pile: ["circle-4", "square-11", "triangle-12"], settings: { tender: "reshuffle" }, current: B }), B));
    expect(session.status).toBe("active");
    expect(session.state.pile).toEqual(["triangle-12"]);
    expect(session.state.hands[B]).toHaveLength(2);
    expect(session.state.market).toHaveLength(1);
    expect(session.state.reshuffles).toBe(1);
  });

  it("tender = reshuffle: with nothing left to reshuffle, the market is finished and the cards are counted", () => {
    // Only the call card is on the pile and the market is empty: drawing can't happen, so nobody is stuck passing.
    const session = ok(market(table({ a: ["circle-10"], b: ["square-7"], top: "triangle-12", market: [], pile: ["triangle-12"], settings: { tender: "reshuffle" }, current: B }), B));
    expect(session.status).toBe("completed");
    expect(session.result).toMatchObject({ outcome: "win", winnerId: B, scores: { [A]: 10, [B]: 7 }, summary: { reason: "tender" } });
  });
});
