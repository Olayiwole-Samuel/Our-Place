"use client";

import { useEffect, useState } from "react";

/**
 * The couple's photos for personalised boards ({ togetherA, togetherB,
 * partners: [{ userId, slot, url }] }), fetched once and shared: game state
 * changes (dice, moves, turns) never refetch them. Signed URLs last an hour,
 * so the cache refreshes a little before that. Failures resolve to "no photos"
 * — boards always have tasteful fallbacks.
 */
const TTL_MS = 50 * 60 * 1000;
const EMPTY = Object.freeze({ togetherA: null, togetherB: null, partners: [] });
let cached = null; // { at, promise }
const listeners = new Set();

export function loadCouplePhotos({ fetcher = fetch, now = Date.now } = {}) {
  if (!cached || now() - cached.at > TTL_MS) {
    const entry = { at: now(), failed: false };
    entry.promise = fetcher("/api/couple/photos", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((data) => {
        if (data) return data;
        // A failure is never cached: the next call (or the hook's retry) tries again.
        entry.failed = true;
        if (cached === entry) cached = null;
        return EMPTY;
      });
    cached = entry;
  }
  return cached.promise;
}

const RETRY_MS = [2000, 6000, 15000];

/** For tests and after a photo changes. */
export function forgetCouplePhotos() {
  cached = null;
}

/** Hook form: null while loading, then the photos object (a stable reference until a photo changes). */
export function useCouplePhotos() {
  const [photos, setPhotos] = useState(null);
  useEffect(() => {
    let live = true;
    let retry = null;
    const update = (attempt = 0) =>
      loadCouplePhotos().then((data) => {
        if (!live) return;
        setPhotos(data);
        // Couldn't load (offline, waking tab): try again a few times; fallbacks show meanwhile.
        if (data === EMPTY && attempt < RETRY_MS.length) retry = setTimeout(() => update(attempt + 1), RETRY_MS[attempt]);
      });
    update();
    const refresh = () => update();
    listeners.add(refresh);
    return () => {
      live = false;
      clearTimeout(retry);
      listeners.delete(refresh);
    };
  }, []);
  return photos;
}

function changed() {
  forgetCouplePhotos();
  listeners.forEach((listener) => listener());
}

/**
 * Board-sized image from a picked file: centre-cropped to a square (the
 * board's photo spots are square) and scaled to at most 720px, encoded as
 * WebP (JPEG where the browser can't encode WebP). Big originals never upload.
 */
export async function boardImageFromFile(file, { size = 720 } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error("not_an_image");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close?.();
  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}

async function send(method, slot, body) {
  const response = await fetch(`/api/couple/photos/${slot}`, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, message: data?.error?.message ?? "That photo couldn't be saved. Try again." };
  changed();
  return { ok: true };
}

/** slot: "together_a" | "together_b" | "portrait"; whose (portraits): "mine" | "partner". */
export async function setCouplePhoto(slot, file, whose = "mine") {
  let image;
  try {
    image = await boardImageFromFile(file);
  } catch {
    return { ok: false, message: "Choose a photo (JPG, PNG or WebP)." };
  }
  return send("PUT", slot, { image, whose });
}

export const removeCouplePhoto = (slot, whose = "mine") => send("DELETE", slot, { whose });
