import "server-only";
import { randomUUID } from "node:crypto";
import { PAIRING_ERROR, PairingError } from "@/lib/couple/errors";
import { parsePhoto } from "@/lib/couple/photos.server";
import { reportError } from "@/lib/errors";

/**
 * The memory wall — photos the couple hangs in their room.
 * Files live in the PRIVATE `couple-memories` bucket at <couple_id>/<file>;
 * members read them through short-lived signed URLs (storage RLS). Only the
 * server writes, after checking the image (type by magic bytes, ≤ 3 MB — the
 * client resizes to ≤ 1600 px first). The couple comes from membership.
 */
export const MEMORY_BUCKET = "couple-memories";
export const MAX_MEMORY_BYTES = 3 * 1024 * 1024; // base64 stays under Vercel's 4.5 MB request limit
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function coupleOf(admin, userId) {
  const { data, error } = await admin.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
  if (!data) throw new PairingError(PAIRING_ERROR.NOT_PAIRED);
  return data.couple_id;
}

const cleanCaption = (caption) =>
  String(caption ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 200);

export async function addMemory({ admin, userId, dataUrl, caption, takenOn }) {
  const { bytes, type, ext } = parsePhoto(dataUrl, { maxBytes: MAX_MEMORY_BYTES });
  if (takenOn != null && (typeof takenOn !== "string" || !DATE.test(takenOn) || Number.isNaN(Date.parse(takenOn)))) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  const coupleId = await coupleOf(admin, userId);
  const path = `${coupleId}/memory-${randomUUID().slice(0, 12)}.${ext}`;
  const upload = await admin.storage.from(MEMORY_BUCKET).upload(path, bytes, { contentType: type, upsert: false, cacheControl: "3600" });
  if (upload.error) {
    reportError(upload.error, { operation: "store memory" });
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  const { data, error } = await admin
    .from("couple_memories")
    .insert({ couple_id: coupleId, uploader_id: userId, path, caption: cleanCaption(caption), taken_on: takenOn ?? null })
    .select("id, caption, taken_on, created_at")
    .single();
  if (error) {
    await admin.storage.from(MEMORY_BUCKET).remove([path]);
    reportError(error, { operation: "record memory" });
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  return data;
}

/** Either partner may edit a memory's caption or date. */
export async function updateMemory({ admin, userId, id, caption, takenOn }) {
  if (takenOn != null && (typeof takenOn !== "string" || !DATE.test(takenOn))) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  const coupleId = await coupleOf(admin, userId);
  const { error } = await admin.from("couple_memories").update({ caption: cleanCaption(caption), taken_on: takenOn ?? null }).eq("id", id).eq("couple_id", coupleId);
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
}

/** Either partner may take a memory down (it's the couple's wall). */
export async function removeMemory({ admin, userId, id }) {
  const coupleId = await coupleOf(admin, userId);
  const { data } = await admin.from("couple_memories").select("id, path").eq("id", id).eq("couple_id", coupleId).maybeSingle();
  if (!data) return;
  await admin.from("couple_memories").delete().eq("id", data.id);
  await admin.storage.from(MEMORY_BUCKET).remove([data.path]);
}
