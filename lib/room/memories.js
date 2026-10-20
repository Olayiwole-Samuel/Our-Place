"use client";

/**
 * Memory wall — browser side. Photos are resized on the device (longest side
 * ≤ 1600 px, WebP or JPEG) before upload, so big originals never leave the
 * phone; the server checks them again (lib/room/memories.server.js).
 */
const MAX_SIDE = 1600;
const MAX_BYTES = 2.9 * 1024 * 1024;

export async function memoryImageFromFile(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("not_an_image");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const quality of [0.84, 0.72, 0.6]) {
    let url = canvas.toDataURL("image/webp", quality);
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", quality);
    if ((url.length * 3) / 4 <= MAX_BYTES) return url;
  }
  throw new Error("too_big");
}

async function call(method, body) {
  let response;
  try {
    response = await fetch("/api/room/memories", { method, headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: "No connection. Try again." };
  }
  const payload = await response.json().catch(() => null);
  return response.ok ? { ok: true, data: payload } : { ok: false, message: payload?.error?.message ?? "Something went wrong. Try again." };
}

export const memoryApi = {
  add: (image, caption, takenOn) => call("POST", { image, caption, takenOn: takenOn || null }),
  update: (id, caption, takenOn) => call("PATCH", { id, caption, takenOn: takenOn || null }),
  remove: (id) => call("DELETE", { id }),
};
