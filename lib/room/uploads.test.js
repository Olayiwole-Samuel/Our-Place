// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// The upload manager against a fake server + B2: pieces of 10 bytes.
const PART = 10;
let server; // { parts: Set<number>, size, fail: { [part]: attempts left }, hang: Set<number> }
const sent = [];

function respond(data, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => data });
}

globalThis.fetch = vi.fn(async (url, { body }) => {
  const payload = JSON.parse(body ?? "{}");
  const count = Math.ceil(server.size / PART);
  if (url === "/api/room/videos") return respond({ id: "v1", uploadId: "u1", partBytes: PART, parts: count });
  if (url === "/api/room/videos/v1/parts") {
    const urls = Object.fromEntries((payload.partNumbers ?? []).map((n) => [n, `https://b2.example/v1?part=${n}`]));
    const done = [...server.parts].sort((a, b) => a - b);
    const uploadedBytes = done.reduce((sum, n) => sum + (n < count ? PART : server.size - PART * (count - 1)), 0);
    return respond({ status: "uploading", uploadId: "u1", parts: count, partBytes: PART, done, uploadedBytes, urls });
  }
  if (url === "/api/room/videos/v1") return respond({ id: "v1", status: server.parts.size === count ? "ready" : "uploading" });
  throw new Error(`unexpected ${url}`);
});

class FakeXHR {
  upload = {};
  open(_method, url) {
    this.part = Number(new URL(url).searchParams.get("part"));
  }
  send(blob) {
    if (server.hang.has(this.part)) return; // never finishes (until aborted)
    setTimeout(() => {
      if (this.aborted) return;
      if (server.fail[this.part] > 0) {
        server.fail[this.part] -= 1;
        return this.onerror?.();
      }
      sent.push(this.part);
      server.parts.add(this.part);
      this.upload.onprogress?.({ loaded: blob.size });
      this.status = 200;
      this.onload?.();
    }, 1);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}
globalThis.XMLHttpRequest = FakeXHR;

const { useUploadStore } = await import("./uploads");
const file = (size) => new File([new Uint8Array(size)], "The Wedding Party.mp4", { type: "video/mp4", lastModified: 1 });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  server = { parts: new Set(), size: 35, fail: {}, hang: new Set() };
  sent.length = 0;
  window.localStorage.clear();
  useUploadStore.setState({ current: null, known: {} });
});

describe("video uploads that carry on where they stopped", () => {
  it("sends every piece once, retries a dropped one, and finishes", async () => {
    server.fail[2] = 1; // piece 2's first try drops
    const changes = vi.fn();
    await useUploadStore.getState().upload(file(35), { kind: "movie", contentType: "video/mp4", onListChange: changes });
    expect([...server.parts].sort()).toEqual([1, 2, 3, 4]);
    expect(sent.filter((n) => n === 2)).toHaveLength(1);
    expect(useUploadStore.getState().current).toBeNull();
    expect(changes).toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem("our-place:video-uploads"))).toEqual({}); // nothing left to resume
  }, 10_000);

  it("Pause keeps what's sent; Resume sends only the rest (no re-pick on the same page)", async () => {
    server.hang.add(3);
    const running = useUploadStore.getState().upload(file(35), { kind: "movie", contentType: "video/mp4" });
    await settle();
    useUploadStore.getState().pause();
    await running;
    expect(useUploadStore.getState().current).toMatchObject({ videoId: "v1", status: "paused", loaded: 25 }); // pieces 1, 2 and 4 (5 bytes) sent; 3 was cut off
    const before = new Set(server.parts);
    server.hang.clear();
    sent.length = 0;
    expect(useUploadStore.getState().resumePaused()).toBe(true);
    await vi.waitFor(() => expect(useUploadStore.getState().current).toBeNull());
    expect(sent.every((n) => !before.has(n))).toBe(true); // nothing sent twice
    expect(server.parts.size).toBe(4);
  });

  it("picking the same file again later carries on (after a reload); a different file is refused", async () => {
    window.localStorage.setItem("our-place:video-uploads", JSON.stringify({ v1: { name: "The Wedding Party.mp4", size: 35, lastModified: 1, kind: "movie", title: "The Wedding Party" } }));
    server.parts = new Set([1, 2]);
    expect(await useUploadStore.getState().resume("v1", new File([new Uint8Array(12)], "other.mp4"))).toMatch(/different file/);
    await useUploadStore.getState().upload(file(35), { kind: "movie", contentType: "video/mp4" }); // the same file via "Upload a movie"
    expect(sent.sort()).toEqual([3, 4]);
    expect(useUploadStore.getState().current).toBeNull();
  });
});
