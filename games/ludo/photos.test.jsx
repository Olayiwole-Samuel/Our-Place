// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCouplePhotos, loadCouplePhotos } from "@/lib/couple/photos";
import { YARD } from "./board";
import Ludo from "./client";
import { BOARD_CELLS, GRID } from "./layout";
import { PHOTO_ZONES } from "./PhotoLayer";

const ME = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const PHOTOS = {
  togetherA: "https://storage.test/couple/together_a.webp?sig=1",
  togetherB: "https://storage.test/couple/together_b.webp?sig=2",
  partners: [
    { userId: ME, slot: 1, url: "https://storage.test/couple/portrait-me.webp?sig=3" },
    { userId: PARTNER, slot: 2, url: "https://storage.test/couple/portrait-partner.webp?sig=4" },
  ],
};
const PROFILES = {
  [ME]: { id: ME, displayName: "Arnold", avatarUrl: "https://lh3.googleusercontent.test/a/me=s96-c" },
  [PARTNER]: { id: PARTNER, displayName: "King", avatarUrl: null },
};
const view = (over = {}) => ({
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
  captures: {},
  winnerId: null,
  pieces: { A1: YARD, A2: YARD, A3: YARD, A4: YARD, B1: YARD, B2: YARD, B3: YARD, B4: YARD },
  ...over,
});

let fetchMock;
const serve = (photos) => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(photos), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
};
beforeEach(() => forgetCouplePhotos());
afterEach(() => vi.unstubAllGlobals());

const board = (v = view(), profiles = PROFILES) => <Ludo view={v} me={ME} partner={PARTNER} names={{ [ME]: "You", [PARTNER]: "King" }} profiles={profiles} status="active" busy={false} act={vi.fn()} />;
const zone = (container, name) => container.querySelector(`[data-zone='${name}']`);
const srcOf = (container, name) => zone(container, name)?.querySelector("img")?.getAttribute("src") ?? null;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("personalised Ludo board", () => {
  it("shows all four photos: both portraits in their owners' yards, two different together photos", async () => {
    serve(PHOTOS);
    const { container } = render(board());
    await settle();
    expect(srcOf(container, "myYard")).toBe(PHOTOS.partners[0].url);
    expect(srcOf(container, "partnerYard")).toBe(PHOTOS.partners[1].url);
    expect(srcOf(container, "topLeft")).toBe(PHOTOS.togetherA);
    expect(srcOf(container, "bottomRight")).toBe(PHOTOS.togetherB);
    expect(srcOf(container, "topLeft")).not.toBe(srcOf(container, "bottomRight"));
    expect(fetchMock).toHaveBeenCalledWith("/api/couple/photos", expect.anything()); // no couple id is ever sent
  });

  it("portraits follow the users, not the screen: seat B sees itself bottom-left, and the board turned", async () => {
    serve(PHOTOS);
    const { container } = render(<Ludo view={view({ mySeat: 1 })} me={PARTNER} partner={ME} names={{ [PARTNER]: "You", [ME]: "Arnold" }} profiles={PROFILES} status="active" busy={false} act={vi.fn()} />);
    await settle();
    expect(srcOf(container, "myYard")).toBe(PHOTOS.partners[1].url);
    expect(srcOf(container, "partnerYard")).toBe(PHOTOS.partners[0].url);
    expect(srcOf(container, "topLeft")).toBe(PHOTOS.togetherB); // same physical board, seen from the other side
    expect(srcOf(container, "bottomRight")).toBe(PHOTOS.togetherA);
  });

  it("missing photos fall back: profile picture (board-sized), then an initial; together → the Our Place mark", async () => {
    serve({ togetherA: null, togetherB: null, partners: [] });
    const { container } = render(board());
    await settle();
    expect(srcOf(container, "myYard")).toBe("https://lh3.googleusercontent.test/a/me=s256-c");
    expect(zone(container, "partnerYard").querySelector("[data-fallback='initial']").textContent).toBe("K");
    expect(zone(container, "topLeft").querySelector("[data-fallback='mark']")).toBeTruthy();
    expect(zone(container, "bottomRight").querySelector("[data-fallback='mark']")).toBeTruthy();
    expect(container.textContent).not.toMatch(/undefined|null|failed/i);
  });

  it("a photo that fails to load is replaced by its fallback (never a broken image)", async () => {
    serve(PHOTOS);
    const { container } = render(board());
    await settle();
    fireEvent.error(zone(container, "topLeft").querySelector("img"));
    expect(zone(container, "topLeft").querySelector("img")).toBeNull();
    expect(zone(container, "topLeft").querySelector("[data-fallback='mark']")).toBeTruthy();
  });

  it("the photos load once and stay put while the game changes (dice, moves, turns)", async () => {
    serve(PHOTOS);
    const { container, rerender } = render(board());
    await settle();
    const before = [...container.querySelectorAll("[data-photo-layer] img")];
    expect(before).toHaveLength(4);
    rerender(board(view({ phase: "awaiting_move", rolls: 1, dice: [{ value: 5, used: false }, { value: 3, used: false }], lastRoll: { number: 1, by: ME, values: [5, 3], outcome: "play" } })));
    rerender(board(view({ current: PARTNER, rolls: 1, pieces: { ...view().pieces, A1: 8 }, lastMove: { number: 1, roll: 1, by: ME, pieceId: "A1", use: "both", values: [5, 3], from: YARD, to: 8, hops: [0, 1, 2, 3, 4, 5, 6, 7, 8], captured: [], home: false } })));
    const after = [...container.querySelectorAll("[data-photo-layer] img")];
    after.forEach((img, i) => expect(img).toBe(before[i])); // the same elements: nothing reloaded
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("photo zones are anchored to the board and never cover a playable square, lane or home", () => {
    const cells = [...BOARD_CELLS.map(({ r, c }) => [r, c]), ...[6, 7, 8].flatMap((r) => [6, 7, 8].map((c) => [r, c]))];
    for (const viewer of [0, 1]) {
      for (const [r, c] of cells) {
        const [y, x] = viewer === 1 ? [GRID - 1 - r, GRID - 1 - c] : [r, c];
        for (const [name, [top, left, size]] of Object.entries(PHOTO_ZONES)) {
          const overlaps = x < left + size && x + 1 > left && y < top + size && y + 1 > top;
          if (overlaps) throw new Error(`${name} covers cell ${r},${c}`);
        }
      }
    }
  });

  it("a failed load isn't cached: the next attempt fetches again", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(JSON.stringify(PHOTOS), { status: 200 }));
    expect(await loadCouplePhotos({ fetcher })).toMatchObject({ togetherA: null, partners: [] });
    expect(await loadCouplePhotos({ fetcher })).toEqual(PHOTOS);
    expect(await loadCouplePhotos({ fetcher })).toEqual(PHOTOS); // success is cached
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("zones are sized in board units (percentages), so they scale with any board size", () => {
    serve(PHOTOS);
    const { container } = render(board());
    const style = zone(container, "myYard").style;
    expect(style.top).toMatch(/%$/);
    expect(style.width).toMatch(/%$/);
  });
});
