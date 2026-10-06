// @vitest-environment jsdom
import { act as actDom, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStage } from "@/components/lobby/games/GameStage";
import { useGameStore } from "@/store/gameStore";
import { useWorldStore } from "@/store/worldStore";
import { HOME, YARD } from "./board";
import Ludo, { piecePlans, statusLines } from "./client";

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const yard = { A1: YARD, A2: YARD, A3: YARD, A4: YARD, B1: YARD, B2: YARD, B3: YARD, B4: YARD };
const baseView = (over = {}) => ({
  seats: [
    { playerId: ME, seat: 0, letter: "A" },
    { playerId: PARTNER, seat: 1, letter: "B" },
  ],
  mySeat: 0,
  current: ME,
  phase: "awaiting_roll",
  dice: null,
  options: [],
  rolls: 0,
  turn: 1,
  doubleSixes: 0,
  bonus: [],
  extraRoll: null,
  lastRoll: null,
  lastMove: null,
  forfeited: [],
  captures: { [ME]: 0, [PARTNER]: 0 },
  winnerId: null,
  ...over,
  pieces: { ...yard, ...over.pieces },
});
const opt = (pieceId, use, values, from, to, extra = {}) => ({ pieceId, use, values, from, to, hops: [], captures: [], enters: from === YARD, ...extra });
/** I rolled `values`; `options` are the server's. */
const rolledView = (values, options, over = {}) =>
  baseView({ phase: "awaiting_move", rolls: 1, dice: values.map((value) => ({ value, used: false })), lastRoll: { number: 1, by: ME, values, doubleSix: values[0] === 6 && values[1] === 6, outcome: "play" }, options, ...over });
const renderLudo = (view, { act = vi.fn(), busy = false, status = "active" } = {}) => {
  const utils = render(<Ludo view={view} me={ME} partner={PARTNER} names={{ [ME]: "You", [PARTNER]: "King" }} profiles={{}} status={status} busy={busy} act={act} />);
  return { act, ...utils };
};
const piece = (container, id) => container.querySelector(`[data-piece='${id}']`);

describe("Naija Ludo board", () => {
  it("renders the board, both players and four pieces each", () => {
    const { container } = renderLudo(baseView());
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("[data-piece^='A']")).toHaveLength(4);
    expect(container.querySelectorAll("[data-piece^='B']")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Your piece A1, in the yard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "King's piece B1, in the yard" })).toBeTruthy();
    expect(screen.getAllByText("King").length).toBeGreaterThan(0); // corner + score card
  });

  it("your turn: says so, the corner is a big Roll button, rolling sends only the intent", () => {
    const { act, container } = renderLudo(baseView());
    expect(screen.getByRole("status").textContent).toBe("Your turn — roll the dice");
    expect(container.querySelector(".ludo-turn")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Roll dice" })[0]);
    expect(act).toHaveBeenCalledWith("roll", {});
  });

  it("not your turn: no roll control and nothing selectable", () => {
    const { container } = renderLudo(baseView({ current: PARTNER }));
    expect(screen.queryByRole("button", { name: "Roll dice" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Waiting for King…");
    expect([...container.querySelectorAll("[data-piece]")].every((b) => b.disabled)).toBe(true);
  });

  it("shows both dice and what's left; only pieces the server lists are tappable", () => {
    const { container } = renderLudo(rolledView([5, 3], [opt("A1", "die0", [5], 10, 15), opt("A1", "die1", [3], 10, 13), opt("A1", "both", [5, 3], 10, 18)], { pieces: { A1: 10, A2: 30 } }));
    expect([...container.querySelectorAll("[data-die]")].slice(-2).map((d) => d.dataset.die)).toEqual(["5", "3"]);
    expect(container.querySelector("[data-dice-left]").textContent).toBe("5 left · 3 left");
    expect(screen.getByRole("status").textContent).toBe("You rolled 5 + 3 — tap a piece");
    expect(piece(container, "A1").disabled).toBe(false);
    expect(piece(container, "A1").getAttribute("aria-label")).toBe("Move piece A1");
    expect(piece(container, "A2").disabled).toBe(true);
    expect(piece(container, "B1").disabled).toBe(true);
  });

  it("one way to use the dice: tapping the piece moves it at once", () => {
    const { act, container } = renderLudo(rolledView([6, 2], [opt("A2", "die0", [6], YARD, 0)], { pieces: { A1: 54 } }));
    fireEvent.click(piece(container, "A2"));
    expect(act).toHaveBeenCalledWith("move", { pieceId: "A2", use: "die0" });
  });

  it("several ways: a small choice at the piece — 5, 3 or 8 — then the chosen dice are sent", () => {
    const { act, container } = renderLudo(rolledView([5, 3], [opt("A1", "die0", [5], 10, 15), opt("A1", "die1", [3], 10, 13), opt("A1", "both", [5, 3], 10, 18, { captures: ["B2"] })], { pieces: { A1: 10 } }));
    fireEvent.click(piece(container, "A1"));
    expect(act).not.toHaveBeenCalled();
    expect(piece(container, "A1").getAttribute("aria-expanded")).toBe("true");
    expect(piece(container, "A1").className).toContain("ludo-piece-selected");
    const choice = screen.getByRole("group", { name: "Use dice for piece A1" });
    const buttons = within(choice).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Move piece A1 5", "Move piece A1 3", "Move piece A1 8 (5 + 3), capture"]);
    fireEvent.focus(buttons[2]);
    expect(container.querySelector("[data-preview]")).toBeTruthy(); // landing square preview
    fireEvent.click(buttons[2]);
    expect(act).toHaveBeenCalledWith("move", { pieceId: "A1", use: "both" });
  });

  it("split: after one die is used, the dice show it and the other die is what's left", () => {
    const view = rolledView([5, 3], [opt("A2", "die1", [3], 20, 23)], { pieces: { A1: 15, A2: 20 } });
    view.dice[0].used = true;
    const { act, container } = renderLudo(view);
    expect(container.querySelector("[data-dice-left]").textContent).toBe("5 used · 3 left");
    expect(container.querySelector("[data-used='true']")).toBeTruthy();
    expect(piece(container, "A1").disabled).toBe(true);
    fireEvent.click(piece(container, "A2"));
    expect(act).toHaveBeenCalledWith("move", { pieceId: "A2", use: "die1" });
  });

  it("Escape closes the choice; keyboard: R rolls, 1–4 taps a piece; listeners go on unmount", () => {
    const options = [opt("A1", "die0", [5], 10, 15), opt("A1", "die1", [3], 10, 13)];
    const { container, unmount } = renderLudo(rolledView([5, 3], options, { pieces: { A1: 10 } }));
    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByRole("group", { name: "Use dice for piece A1" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(piece(container, "A1").getAttribute("aria-expanded")).toBe("false");
    unmount();
    const rolling = renderLudo(baseView());
    fireEvent.keyDown(window, { key: "r" });
    expect(rolling.act).toHaveBeenCalledWith("roll", {});
    rolling.unmount();
    fireEvent.keyDown(window, { key: "r" });
    expect(rolling.act).toHaveBeenCalledTimes(1);
  });

  it("busy (a request in flight) makes nothing tappable", () => {
    const { container } = renderLudo(rolledView([4, 1], [opt("A1", "die0", [4], 10, 14)], { pieces: { A1: 10 } }), { busy: true });
    expect(piece(container, "A1").disabled).toBe(true);
  });

  it("houses are drawn and announced", () => {
    const { container } = renderLudo(baseView({ pieces: { A1: 12, A2: 12, B1: 3 } }));
    expect(container.querySelectorAll("[data-house='0']")).toHaveLength(1);
    expect(piece(container, "A1").getAttribute("aria-label")).toBe("Your piece A1, on the track, in a house");
  });

  it("home pieces sit in the centre and are counted", () => {
    renderLudo(baseView({ pieces: { A1: HOME, A2: HOME } }));
    expect(screen.getByText("2/4 home")).toBeTruthy();
    const top = parseFloat(piecePlans(baseView({ pieces: { A1: HOME } }), 0, true, 0).A1.animate.top);
    expect(top > 40 && top < 60).toBe(true);
  });

  it("bonus rolls, kills, the partner's dice and the third double six are announced briefly", () => {
    expect(statusLines(baseView({ extraRoll: "double_six", rolls: 2 }), ME, "King").line).toBe("Double six! Roll again.");
    expect(statusLines(baseView({ extraRoll: "capture", rolls: 2 }), ME, "King").line).toBe("Nice! Roll again.");
    const kill = { number: 3, roll: 2, by: ME, pieceId: "A1", use: "die0", values: [5], from: 10, to: 15, hops: [11, 12, 13, 14, 15], captured: [{ pieceId: "B1", from: 41 }], home: false };
    expect(statusLines(baseView({ rolls: 2, lastRoll: { number: 2, by: ME, values: [5, 2], outcome: "play" }, lastMove: kill }), ME, "King").event).toBe("You captured King's piece 💥");
    expect(statusLines(baseView({ rolls: 2, lastRoll: { number: 2, by: PARTNER, values: [5, 2], outcome: "play" }, lastMove: { ...kill, by: PARTNER } }), ME, "King").event).toBe("King captured your piece");
    expect(statusLines(rolledView([6, 6], [], { current: PARTNER, lastRoll: { number: 1, by: PARTNER, values: [6, 6], doubleSix: true, outcome: "play" } }), ME, "King").line).toBe("King rolled 6 + 6");
    expect(statusLines(baseView({ current: PARTNER, rolls: 5, lastRoll: { number: 5, by: ME, values: [6, 6], doubleSix: true, outcome: "three_double_sixes" } }), ME, "King").event).toBe("Your third double six — turn over.");
    expect(statusLines(baseView({ current: PARTNER, rolls: 2, lastRoll: { number: 2, by: ME, values: [3, 4], outcome: "no_move" } }), ME, "King").event).toBe("You rolled 3 + 4 — no move.");
  });

  it("seat B sees the same board turned around: their own yard bottom-left", () => {
    const mine = piecePlans(baseView({ mySeat: 1 }), 1, true, 0).B1.animate;
    expect(parseFloat(mine.top)).toBeGreaterThan(50);
    expect(parseFloat(mine.left)).toBeLessThan(50);
    const theirs = piecePlans(baseView(), 0, true, 0).B1.animate;
    expect(parseFloat(theirs.top)).toBeLessThan(50);
  });
});

describe("movement and kill animation (presentation only)", () => {
  const moved = baseView({
    rolls: 3,
    pieces: { A1: 18, B1: YARD },
    lastMove: { number: 3, roll: 3, by: ME, pieceId: "A1", use: "both", values: [5, 3], from: 10, to: 18, hops: [11, 12, 13, 14, 15, 16, 17, 18], captured: [{ pieceId: "B1", from: b(18) }], home: false },
  });
  function b(square) {
    return (square - 26 + 52) % 52;
  }

  it("a new move walks the server's path square by square; the killed piece goes back after it", () => {
    const plans = piecePlans(moved, 0, false, 0);
    expect(plans.A1.animate.top).toHaveLength(9); // from + 8 hops
    expect(Array.isArray(plans.B1.animate.top)).toBe(true);
    expect(plans.B1.transition.duration).toBeGreaterThan(plans.A1.transition.duration);
    expect(typeof plans.A2.animate.top).toBe("string");
  });

  it("reduced motion: pieces jump straight to the server position", () => {
    const plans = piecePlans(moved, 0, true, 0);
    expect(typeof plans.A1.animate.top).toBe("string");
    expect(plans.A1.transition.duration).toBe(0);
  });

  it("a move from before this board opened (a reload) isn't replayed", () => {
    expect(typeof piecePlans(moved, 0, false, 3).A1.animate.top).toBe("string");
  });

  it("stacked pieces fan out instead of hiding each other", () => {
    const plans = piecePlans(baseView({ pieces: { A1: 12, A2: 12 } }), 0, true, 0);
    expect(plans.A1.animate.top).not.toBe(plans.A2.animate.top);
    expect(plans.A1.animate.scale).toBeLessThan(1);
  });
});

describe("Ludo inside the game shell", () => {
  const PROFILE_ME = { id: ME, displayName: "Arnold Me", avatarUrl: null };
  const PROFILE_PARTNER = { id: PARTNER, displayName: "King Partner", avatarUrl: null };
  const SESSION = "33333333-3333-4333-8333-333333333333";
  const session = (over = {}) => ({ id: SESSION, gameId: "ludo", status: "active", createdBy: ME, players: [ME, PARTNER], ready: [ME, PARTNER], version: 2, result: null, winnerId: null, ...over });
  const result = (winnerId) => ({
    outcome: "win",
    winnerId,
    scores: null,
    summary: { headline: "Home Sweet Home 🏆", line: "All four pieces made it home.", lines: { winner: "You brought all four pieces home first.", loser: "{winner} brought all four home first." } },
  });
  let fetchMock;
  beforeEach(() => {
    actDom(() => {
      useGameStore.getState().init(ME);
      useWorldStore.getState().reset();
      useWorldStore.getState().dispatchPartner({ type: "sync", partnerPresent: true });
    });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ session: session({ status: "waiting", players: [ME], ready: [] }), view: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads lazily in the wide board shell and sends a roll as an intent", async () => {
    actDom(() => useGameStore.getState().receive({ session: session(), view: baseView() }));
    render(<GameStage me={PROFILE_ME} partner={PROFILE_PARTNER} onEmote={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Ludo" }).dataset.layout).toBe("board");
    const roll = (await screen.findAllByRole("button", { name: "Roll dice" }))[0];
    await actDom(async () => fireEvent.click(roll));
    expect(fetchMock).toHaveBeenCalledWith(`/api/games/sessions/${SESSION}/action`, expect.objectContaining({ body: JSON.stringify({ type: "roll", payload: {}, version: 2 }) }));
  });

  it("winner screen (as the loser): winner, partner, streak, Play again", async () => {
    actDom(() =>
      useGameStore.getState().receive({
        session: session({ status: "completed", winnerId: PARTNER, result: result(PARTNER), version: 90, streaks: { [PARTNER]: { current: 3, best: 3 }, [ME]: { current: 0, best: 2 } } }),
        view: baseView({ phase: "finished", winnerId: PARTNER, pieces: { B1: HOME, B2: HOME, B3: HOME, B4: HOME } }),
      }),
    );
    const onEmote = vi.fn();
    render(<GameStage me={PROFILE_ME} partner={PROFILE_PARTNER} onEmote={onEmote} />);
    expect(await screen.findByText("King won")).toBeTruthy();
    expect(screen.getByText("Home Sweet Home 🏆")).toBeTruthy();
    expect(screen.getByText("King brought all four home first.")).toBeTruthy();
    expect(screen.getByText("King · winner")).toBeTruthy();
    expect(screen.getByText("🔥 3 wins in a row")).toBeTruthy();
    expect(onEmote).not.toHaveBeenCalled();
    await actDom(async () => fireEvent.click(screen.getByRole("button", { name: /Play again/ })));
    expect(fetchMock).toHaveBeenCalledWith("/api/games/sessions", expect.objectContaining({ body: JSON.stringify({ gameId: "ludo" }) }));
  });

  it("winner screen (as the winner) celebrates, and Return to Our Place closes it", async () => {
    actDom(() => useGameStore.getState().receive({ session: session({ status: "completed", winnerId: ME, result: result(ME), version: 90 }), view: baseView({ phase: "finished", winnerId: ME }) }));
    const onEmote = vi.fn();
    render(<GameStage me={PROFILE_ME} partner={PROFILE_PARTNER} onEmote={onEmote} />);
    expect(await screen.findByText("You won! 🎉")).toBeTruthy();
    expect(screen.getByText("You brought all four pieces home first.")).toBeTruthy();
    expect(onEmote).toHaveBeenCalledWith("dance");
    fireEvent.click(screen.getByRole("button", { name: "Return to Our Place" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useWorldStore.getState().inGame).toBe(false);
  });
});
