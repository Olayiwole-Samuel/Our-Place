// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRoomStore } from "@/store/roomStore";
import { TvPanel } from "./TvPanel";

// The TV with a fake <video> (jsdom has no media playback) and a fake shared TV state.
const media = { duration: 100, readyState: 4, bufferedEnd: 100 };
Object.defineProperties(HTMLMediaElement.prototype, {
  duration: { configurable: true, get: () => media.duration },
  readyState: { configurable: true, get: () => media.readyState },
  paused: { configurable: true, get() { return this._paused ?? true; } },
  buffered: { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => media.bufferedEnd }) },
});
HTMLMediaElement.prototype.play = function play() {
  this._paused = false;
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function pause() {
  this._paused = true;
};

const ME = "me";
const videos = [
  { id: "s1", uploaderId: ME, kind: "movie", title: "Squid Game S01E01 Red Light Green Light", sizeBytes: 6e8, status: "ready", createdAt: "2026-10-21T10:00:00Z" },
  { id: "s2", uploaderId: ME, kind: "movie", title: "Squid Game S01E02 Hell", sizeBytes: 6e8, status: "ready", createdAt: "2026-10-21T10:01:00Z" },
  { id: "m1", uploaderId: ME, kind: "movie", title: "The Wedding Party", sizeBytes: 1.4e9, status: "ready", createdAt: "2026-10-21T10:02:00Z" },
];
const playing = (id, atSeconds, extra = {}) => ({ source: { type: "video", id, title: videos.find((v) => v.id === id).title }, playing: true, atSeconds, updatedAt: new Date(Date.now() - 500).toISOString(), updatedBy: ME, version: 3, ...extra });

let setWatch;
let announceWaiting;
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(media, { duration: 100, readyState: 4, bufferedEnd: 100 });
  globalThis.fetch = vi.fn(async (url) => ({ ok: true, json: async () => (url === "/api/room/videos" ? { uploads: true } : { url: "https://b2.example/movie.mp4" }) }));
  setWatch = vi.fn(async ({ source, playing: isPlaying, atSeconds }) => {
    const current = useRoomStore.getState().watch;
    useRoomStore.setState({ watch: { source, playing: isPlaying, atSeconds, updatedAt: new Date().toISOString(), updatedBy: ME, version: (current?.version ?? 0) + 1 } });
    return null;
  });
  announceWaiting = vi.fn();
  useRoomStore.setState({ preview: true, videos, watch: null, skewMs: 0, partnerWaiting: null, panel: "tv", setWatch, announceWaiting, me: () => ME });
});
afterEach(() => vi.useRealTimers());

/** Render, then let the <video> say its metadata loaded and the player tick once. */
async function renderPlaying() {
  render(<TvPanel me={ME} partnerName="King" />);
  await act(async () => {});
  const video = document.querySelector("video");
  await act(async () => {
    video.dispatchEvent(new Event("loadedmetadata"));
  });
  await act(async () => {
    vi.advanceTimersByTime(1100);
  });
  return video;
}

describe("the TV", () => {
  it("groups a series into a folder, episodes in order", async () => {
    render(<TvPanel me={ME} partnerName="King" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("tab", { name: /Movies/ }));
    const folder = screen.getByRole("button", { name: /Squid Game/ });
    expect(folder.textContent).toMatch(/2 eps/);
    fireEvent.click(folder);
    const titles = screen.getAllByText(/^S1 · E\d/).map((node) => node.textContent);
    expect(titles).toEqual(["S1 · E1 · Red Light Green Light", "S1 · E2 · Hell"]);
    expect(screen.getByText("The Wedding Party")).toBeTruthy();
  });

  it("at the end of an episode, the next one starts by itself (after Up next)", async () => {
    useRoomStore.setState({ watch: playing("s1", 99.9) });
    await renderPlaying();
    expect(screen.getByText(/Up next in \d/).parentElement.textContent).toMatch(/S1 · E2 · Hell/);
    expect(screen.getByRole("button", { name: /Next episode: Squid Game S01E02/ })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(setWatch).toHaveBeenLastCalledWith({ source: { type: "video", id: "s2", title: videos[1].title }, playing: true, atSeconds: 0 });
  });

  it("a movie that ends starts again by itself — unless you cancel", async () => {
    useRoomStore.setState({ watch: playing("m1", 99.9) });
    await renderPlaying();
    expect(screen.getByText(/Starting again in \d/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setWatch).toHaveBeenLastCalledWith(expect.objectContaining({ playing: false, atSeconds: 100 }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(setWatch).toHaveBeenCalledTimes(1); // no replay after Cancel
    expect(screen.getByRole("button", { name: /Watch again/ })).toBeTruthy();
  });

  it("a slow connection pauses it for both of you, then carries on together", async () => {
    media.readyState = 1; // stuck loading
    media.bufferedEnd = 0;
    useRoomStore.setState({ watch: playing("m1", 10) });
    await renderPlaying();
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(setWatch).toHaveBeenCalledWith(expect.objectContaining({ playing: false }));
    expect(announceWaiting).toHaveBeenCalledWith(true);
    expect(screen.getByText(/Paused for both of you while your connection catches up/)).toBeTruthy();
    const heldAt = setWatch.mock.calls[0][0].atSeconds;

    media.readyState = 4; // caught up
    media.bufferedEnd = heldAt + 20;
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(setWatch).toHaveBeenLastCalledWith(expect.objectContaining({ playing: true, atSeconds: heldAt }));
    expect(announceWaiting).toHaveBeenLastCalledWith(false);
  });

  it("when it's held for your partner, you see why — and can keep watching", async () => {
    useRoomStore.setState({ watch: { ...playing("m1", 30), playing: false }, partnerWaiting: { since: Date.now() } });
    await renderPlaying();
    expect(screen.getByText("Waiting for King…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Keep watching/ }));
    expect(setWatch).toHaveBeenLastCalledWith(expect.objectContaining({ playing: true, atSeconds: 30 }));
  });
});
