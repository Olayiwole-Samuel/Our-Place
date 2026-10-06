// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TicTacToe from "@/games/tic_tac_toe/client";
import { GAME_CATEGORIES } from "@/lib/game/categories";
import { gameAvailability, gameLabels } from "@/lib/game/gating";
import { gameRegistry } from "@/lib/game/catalog";
import { useChatStore } from "@/store/chatStore";
import { useGameStore } from "@/store/gameStore";
import { useWorldStore } from "@/store/worldStore";
import { GameMenu } from "./GameMenu";
import { GameStage } from "./GameStage";

const ME = { id: "11111111-1111-4111-8111-111111111111", displayName: "Arnold Me", avatarUrl: null };
const PARTNER = { id: "22222222-2222-4222-8222-222222222222", displayName: "King Partner", avatarUrl: null };
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const session = (over = {}) => ({
  id: SESSION_ID,
  gameId: "tic_tac_toe",
  status: "waiting",
  createdBy: ME.id,
  players: [ME.id],
  ready: [],
  version: 0,
  result: null,
  winnerId: null,
  ...over,
});
const board = (over = {}) => ({ cells: Array(9).fill(null), marks: { [ME.id]: "X", [PARTNER.id]: "O" }, turn: { order: [ME.id, PARTNER.id], index: 0, number: 1 }, line: null, ...over });

let fetchMock;
beforeEach(() => {
  act(() => {
    useGameStore.getState().init(ME.id);
    useChatStore.getState().reset();
    useWorldStore.getState().reset();
    useWorldStore.getState().dispatchPartner({ type: "sync", partnerPresent: true });
  });
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ session: session(), view: null }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("game metadata for the menu", () => {
  it("labels games in human terms, never capability names", () => {
    expect(gameLabels(gameRegistry.get("ludo"))).toEqual(["2 Players", "Turn Based"]);
    expect(gameLabels(gameRegistry.get("shooting_range"))).toEqual(["2 Players", "Realtime"]);
    expect(gameLabels(gameRegistry.get("would_you_rather"))).toEqual(["2 Players", "Conversation"]);
    expect(gameLabels(gameRegistry.get("jigsaw_puzzle"))).toEqual(["2 Players", "Co-op"]);
  });

  it("gates availability honestly: coming soon, 18+ locked, unknown", () => {
    expect(gameAvailability(gameRegistry.get("tic_tac_toe")).launchable).toBe(true);
    expect(gameAvailability(gameRegistry.get("chess"))).toMatchObject({ launchable: false, status: "coming_soon" });
    expect(gameAvailability(gameRegistry.get("truth_or_dare"))).toMatchObject({ launchable: false, status: "locked" });
    expect(gameAvailability(null).launchable).toBe(false);
  });
});

describe("in-world game menu", () => {
  it("shows the ten categories in order as labelled controls", () => {
    render(<GameMenu />);
    const rail = screen.getByRole("toolbar", { name: "Game categories" });
    const names = [...rail.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(GAME_CATEGORIES.map((c) => c.name));
    expect(names).toContain("Flirty / Spicy");
  });

  it("a category opens its drawer of games; Escape closes it", async () => {
    render(<GameMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Board & Strategy" }));
    const drawer = await screen.findByRole("complementary", { name: "Board & Strategy games" });
    for (const name of ["Chess", "Ludo", "Tic Tac Toe", "Battleship"]) expect(drawer.textContent).toContain(name);
    expect(drawer.textContent).toContain("Coming soon");
    expect(screen.getByRole("button", { name: "Board & Strategy" }).getAttribute("aria-expanded")).toBe("true");
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await waitFor(() => expect(useGameStore.getState().drawer).toBeNull());
  });

  it("unavailable games don't launch — they say so", async () => {
    render(<GameMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Board & Strategy" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Chess/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("This game isn't ready yet.")).toBeTruthy();
  });

  it("18+ games are locked by default", async () => {
    render(<GameMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Flirty / Spicy" }));
    const drawer = await screen.findByRole("complementary", { name: "Flirty / Spicy games" });
    expect(drawer.textContent).toContain("18+ · Locked");
    fireEvent.click(screen.getByRole("button", { name: /^Truth or Dare/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selecting an available game creates a session and closes the drawer", async () => {
    render(<GameMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Board & Strategy" }));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: /^Tic Tac Toe/ })));
    expect(fetchMock).toHaveBeenCalledWith("/api/games/sessions", expect.objectContaining({ method: "POST", body: JSON.stringify({ gameId: "tic_tac_toe" }) }));
    expect(useGameStore.getState()).toMatchObject({ drawer: null, session: { id: SESSION_ID, status: "waiting" } });
  });

  it("opening chat closes the drawer (they share the right side)", async () => {
    render(<GameMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Puzzle" }));
    act(() => useChatStore.getState().setOpen(true));
    await waitFor(() => expect(useGameStore.getState().drawer).toBeNull());
  });
});

describe("launch → play → result", () => {
  const stage = (onEmote = vi.fn()) => {
    render(<GameStage me={ME} partner={PARTNER} onEmote={onEmote} />);
    return onEmote;
  };

  it("invite: the partner's new game offers Join / Not now", async () => {
    act(() => useGameStore.getState().receive({ session: session({ createdBy: PARTNER.id, players: [PARTNER.id] }) }));
    stage();
    expect(screen.getByRole("alertdialog").textContent).toContain("King wants to play Tic Tac Toe");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join" })));
    expect(fetchMock).toHaveBeenCalledWith(`/api/games/sessions/${SESSION_ID}/join`, expect.objectContaining({ method: "POST" }));
  });

  it("lobby: shows both players and ready state; Ready is sent to the server", async () => {
    act(() => useGameStore.getState().receive({ session: session({ players: [ME.id, PARTNER.id], ready: [PARTNER.id] }) }));
    stage();
    const dialog = screen.getByRole("dialog", { name: "Tic Tac Toe" });
    expect(dialog.textContent).toContain("Not ready");
    expect(dialog.textContent).toContain("Ready");
    expect(useWorldStore.getState().inGame).toBe(true); // movement pauses while a game is open
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ready" })));
    expect(fetchMock).toHaveBeenCalledWith(`/api/games/sessions/${SESSION_ID}/ready`, expect.objectContaining({ body: JSON.stringify({ ready: true }) }));
  });

  it("lobby: says when the partner isn't here", () => {
    act(() => {
      useWorldStore.getState().dispatchPartner({ type: "partner_left" });
      useGameStore.getState().receive({ session: session() });
    });
    stage();
    expect(screen.getByText("King isn't here yet.")).toBeTruthy();
  });

  it("playing: loads the game lazily and sends moves as intents", async () => {
    act(() => useGameStore.getState().receive({ session: session({ status: "active", players: [ME.id, PARTNER.id], ready: [ME.id, PARTNER.id], version: 1 }), view: board() }));
    stage();
    const cell = await screen.findByRole("gridcell", { name: "Row 2, column 2: empty" });
    await act(async () => fireEvent.click(cell));
    expect(fetchMock).toHaveBeenCalledWith(`/api/games/sessions/${SESSION_ID}/action`, expect.objectContaining({ body: JSON.stringify({ type: "place", payload: { cell: 4 }, version: 1 }) }));
  });

  it("result: a win celebrates with the existing emote system, then returns home", async () => {
    act(() =>
      useGameStore.getState().receive({
        session: session({ status: "completed", players: [ME.id, PARTNER.id], winnerId: ME.id, result: { outcome: "win", winnerId: ME.id, summary: { line: [0, 1, 2] } }, version: 6 }),
        view: board({ cells: [ME.id, ME.id, ME.id, PARTNER.id, PARTNER.id, null, null, null, null], line: [0, 1, 2] }),
      }),
    );
    const onEmote = stage();
    expect(await screen.findByText("You won! 🎉")).toBeTruthy();
    expect(onEmote).toHaveBeenCalledWith("dance");
    fireEvent.click(screen.getByRole("button", { name: "Return to Our Place" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useWorldStore.getState().inGame).toBe(false);
  });

  it("result: draws and abandoned games have no winner celebration", async () => {
    act(() =>
      useGameStore.getState().receive({
        session: session({ status: "abandoned", players: [ME.id, PARTNER.id], result: { outcome: "abandoned", summary: { reason: "left", by: PARTNER.id } }, version: 3 }),
        view: board(),
      }),
    );
    const onEmote = stage();
    expect(await screen.findByText("King left the game")).toBeTruthy();
    expect(onEmote).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Play again/ })).toBeNull();
  });
});

describe("Tic Tac Toe client", () => {
  it("only lets you play your own turn, on empty squares", () => {
    const act_ = vi.fn();
    const { rerender } = render(<TicTacToe view={board({ turn: { order: [PARTNER.id, ME.id], index: 0, number: 1 } })} me={ME.id} status="active" act={act_} />);
    fireEvent.click(screen.getByRole("gridcell", { name: "Row 1, column 1: empty" }));
    expect(act_).not.toHaveBeenCalled();
    expect(screen.getByText("Their move…")).toBeTruthy();
    rerender(<TicTacToe view={board({ cells: [PARTNER.id, null, null, null, null, null, null, null, null] })} me={ME.id} status="active" act={act_} />);
    fireEvent.click(screen.getByRole("gridcell", { name: "Row 1, column 1: O" }));
    expect(act_).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("gridcell", { name: "Row 1, column 2: empty" }));
    expect(act_).toHaveBeenCalledWith("place", { cell: 1 });
  });
});
