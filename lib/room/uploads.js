"use client";

import { create } from "zustand";

/**
 * Uploads for the TV, in pieces (lib/room/videos.server.js), so they can always
 * carry on from where they stopped: Pause, closing the TV, a dropped connection
 * or closing the app keeps every piece already sent. Pick the same file again —
 * from "Upload", or Resume on its row (any device) — and only the rest is sent.
 *
 * Lives outside the TV panel, so an upload keeps going while the panel is closed.
 * One upload at a time. State:
 *   current  null | { videoId, title, kind, loaded, total, status, message }
 *            status: "starting" | "uploading" | "finishing" | "paused" | "failed"
 *   known    { [videoId]: { name, size, lastModified } } — files this browser was sending
 */
const PARALLEL = 3;
const RETRIES = 4;
const SIGN_BATCH = 12;
const STORE_KEY = "our-place:video-uploads";

const read = () => {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
};
const write = (known) => {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(known));
  } catch {
    // private mode: resuming still works by picking the file again
  }
};

const fingerprint = (file) => ({ name: file.name, size: file.size, lastModified: file.lastModified });
const sameFile = (a, b) => a && b && a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

async function post(url, body, method = "POST") {
  const response = await fetch(url, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.error?.message ?? "Something went wrong."), { status: response.status, code: data?.error?.code });
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The video title from a file name: "the_wedding.party.mp4" → "the wedding party". */
export const titleFromFile = (file) =>
  file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[._]+/g, " ")
    .trim()
    .slice(0, 120) || "Our video";

// The one upload in flight: its file and the requests to stop on Pause.
let job = null; // { videoId, file, uploadId, requests: Set<XMLHttpRequest>, stopped }
// The file of the last upload on this page, so Resume after a pause needs no re-pick.
let lastFile = { videoId: null, file: null };

export const useUploadStore = create((set, get) => ({
  current: null,
  known: {},

  /** Loads what this browser was sending before (call once on the client). */
  hydrate: () => set({ known: read() }),

  /** Upload a new file — or carry on with it, if it's one this browser had started. */
  async upload(file, { kind, contentType, onListChange }) {
    if (job) return;
    const known = { ...read() };
    const resumeId = Object.keys(known).find((id) => sameFile(known[id], fingerprint(file)));
    if (resumeId) return get().resume(resumeId, file, { onListChange });

    const title = titleFromFile(file);
    set({ current: { videoId: null, title, kind, loaded: 0, total: file.size, status: "starting", message: null } });
    let started;
    try {
      started = await post("/api/room/videos", { title, kind, size: file.size, contentType });
    } catch (error) {
      set({ current: { videoId: null, title, kind, loaded: 0, total: file.size, status: "failed", message: error.message || "Couldn't start the upload." } });
      return;
    }
    known[started.id] = { ...fingerprint(file), kind, title };
    write(known);
    set({ known });
    onListChange?.();
    return get().run(started.id, file, started.uploadId, { onListChange });
  },

  /**
   * Carry on with an unfinished upload. `file` must be the same file (name and
   * size; on this browser also its date). Returns an error message or null.
   */
  async resume(videoId, file, { expected, onListChange } = {}) {
    if (job) return "Another upload is already running.";
    const remembered = read()[videoId];
    if (remembered ? remembered.name !== file.name || remembered.size !== file.size : expected && expected.size !== file.size) {
      return `That's a different file — pick “${remembered?.name ?? expected?.title ?? "the same video"}” to carry on.`;
    }
    const known = { ...read(), [videoId]: { ...fingerprint(file), kind: remembered?.kind ?? expected?.kind, title: remembered?.title ?? expected?.title ?? titleFromFile(file) } };
    write(known);
    set({ known });
    return get().run(videoId, file, undefined, { onListChange });
  },

  async run(videoId, file, uploadId, { onListChange } = {}) {
    const meta = read()[videoId] ?? {};
    const here = { videoId, file, uploadId, requests: new Set(), stopped: false };
    job = here;
    lastFile = { videoId, file };
    const base = { videoId, title: meta.title ?? titleFromFile(file), kind: meta.kind ?? "movie", total: file.size, message: null };
    set({ current: { ...base, loaded: 0, status: "starting" } });

    const inFlight = new Map(); // partNumber → bytes sent so far
    let doneBytes = 0;
    let lastPaint = 0;
    const paint = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPaint < 150) return;
      lastPaint = now;
      if (job !== here) return;
      let loaded = doneBytes;
      for (const bytes of inFlight.values()) loaded += bytes;
      set({ current: { ...base, loaded: Math.min(file.size, loaded), status: "uploading" } });
    };

    const fail = (message, status = "failed") => {
      if (job === here) job = null;
      set({ current: { ...base, loaded: doneBytes, status, message } }); // exactly what's saved (pieces cut off mid-way are sent again)
    };

    try {
      // Where are we? (Also finds the upload on a new device, or starts a fresh one.)
      let info = await post(`/api/room/videos/${videoId}/parts`, { uploadId, partNumbers: [] });
      if (info.status === "ready") return get().finished(videoId, onListChange);
      here.uploadId = info.uploadId;
      const { parts, partBytes } = info;
      const done = new Set(info.done);
      doneBytes = info.uploadedBytes;
      paint(true);
      const queue = Array.from({ length: parts }, (_, i) => i + 1).filter((n) => !done.has(n));

      const urls = {};
      const urlFor = async (partNumber) => {
        if (!urls[partNumber]) {
          const batch = [partNumber, ...queue.filter((n) => !urls[n] && n !== partNumber)].slice(0, SIGN_BATCH);
          info = await post(`/api/room/videos/${videoId}/parts`, { uploadId: here.uploadId, partNumbers: batch });
          Object.assign(urls, info.urls);
        }
        return urls[partNumber];
      };

      const sendPart = (partNumber, url) =>
        new Promise((resolve, reject) => {
          const start = (partNumber - 1) * partBytes;
          const blob = file.slice(start, Math.min(file.size, start + partBytes));
          const request = new XMLHttpRequest();
          here.requests.add(request);
          request.open("PUT", url);
          request.upload.onprogress = (event) => {
            inFlight.set(partNumber, event.loaded);
            paint();
          };
          request.onload = () => {
            here.requests.delete(request);
            if (request.status >= 200 && request.status < 300) resolve(blob.size);
            else reject(Object.assign(new Error(`piece ${partNumber}: HTTP ${request.status}`), { status: request.status }));
          };
          request.onerror = () => {
            here.requests.delete(request);
            reject(new Error("network"));
          };
          request.onabort = () => {
            here.requests.delete(request);
            reject(new Error("stopped"));
          };
          request.send(blob);
        });

      const worker = async () => {
        while (queue.length && !here.stopped) {
          const partNumber = queue.shift();
          for (let attempt = 0; ; attempt++) {
            if (here.stopped) throw new Error("stopped");
            try {
              const size = await sendPart(partNumber, await urlFor(partNumber));
              inFlight.delete(partNumber);
              doneBytes += size;
              paint(true);
              break;
            } catch (error) {
              inFlight.delete(partNumber);
              if (here.stopped || error.message === "stopped") throw error;
              if (error.status === 403) delete urls[partNumber]; // link expired: sign again
              if (attempt >= RETRIES) throw error;
              await sleep(1500 * 2 ** attempt); // 1.5 s, 3 s, 6 s, 12 s
            }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length || 1) }, worker));
      if (here.stopped) throw new Error("stopped");

      set({ current: { ...base, loaded: file.size, status: "finishing" } });
      const finished = await post(`/api/room/videos/${videoId}`, { uploadId: here.uploadId });
      if (finished.status !== "ready") throw new Error("incomplete");
      return get().finished(videoId, onListChange);
    } catch (error) {
      if (job !== here) return;
      if (here.stopped || error.message === "stopped") return fail(null, "paused");
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return fail(offline || error.message === "network" ? "Connection lost — it will carry on when you're back online." : error.message === "incomplete" ? "Some pieces didn't arrive — tap Resume." : error.message, "paused");
    }
  },

  finished(videoId, onListChange) {
    job = null;
    const known = { ...read() };
    delete known[videoId];
    write(known);
    set({ known, current: null });
    onListChange?.();
  },

  /** Stop sending; every piece already sent is kept. The file stays picked on this page, so Resume needs no re-pick. */
  pause() {
    if (!job) return;
    job.stopped = true;
    for (const request of job.requests) request.abort();
  },

  /** Resume the paused upload without picking the file again (same page only). Returns false if a pick is needed. */
  resumePaused({ onListChange } = {}) {
    const current = get().current;
    if (job || !current?.videoId || lastFile.videoId !== current.videoId) return false;
    get().run(current.videoId, lastFile.file, undefined, { onListChange });
    return true;
  },

  /** Clear a failed / paused card (the upload itself stays resumable from its row). */
  dismiss() {
    if (!job) set({ current: null });
  },

  /** Forget a video's upload here (after it's deleted). */
  forget(videoId) {
    if (job?.videoId === videoId) get().pause();
    if (lastFile.videoId === videoId) lastFile = { videoId: null, file: null };
    const known = { ...read() };
    delete known[videoId];
    write(known);
    set({ known, current: get().current?.videoId === videoId ? null : get().current });
  },
}));

if (typeof window !== "undefined") {
  // Back online after a drop: carry on by itself.
  window.addEventListener("online", () => {
    const { current, resumePaused } = useUploadStore.getState();
    if (current?.status === "paused" && current.message) resumePaused();
  });
  // Leaving mid-upload: the browser asks first (it can be resumed later anyway).
  window.addEventListener("beforeunload", (event) => {
    if (job && !job.stopped) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
