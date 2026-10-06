import "server-only";
import { randomUUID } from "node:crypto";
import { PAIRING_ERROR, PairingError } from "@/lib/couple/errors";
import { reportError } from "@/lib/errors";
import { getGalleryModel } from "./gallery";
import { inspectCharacterGlb } from "./glb";
import { DEFAULT_CHARACTER } from "./schema";
import { MODEL_BUCKET } from "./server";

/**
 * Where a character comes from — written ONLY by the server (service role):
 *
 *   designed   built-in studio character (config)
 *   gallery    a ready-made CC0 character shipped with the app (validated id)
 *   imported   the user's own GLB: uploaded straight to private storage with a
 *              one-time signed URL, then validated here before it is used
 *   metaperson selfie-generated (lib/character/metaperson.server.js)
 *
 * `userId` is always the verified session user. Paths are always built here
 * from that id — never accepted from the client except an upload path that must
 * sit in the user's own pending-upload slot.
 */
const PENDING_PREFIX = "upload-";

async function previousRow(admin, userId) {
  const { data } = await admin.from("characters").select("model_path, config").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

async function saveSource(admin, userId, fields) {
  const previous = await previousRow(admin, userId);
  const row = {
    user_id: userId,
    config: previous?.config ?? DEFAULT_CHARACTER,
    model_path: null,
    library_model: null,
    provider_ref: null,
    provider_state: null,
    ...fields,
  };
  const saved = await admin.from("characters").upsert(row, { onConflict: "user_id" });
  if (saved.error) {
    reportError(saved.error, { operation: "save character source" });
    throw new PairingError(PAIRING_ERROR.UNAVAILABLE);
  }
  // A model no longer referenced is deleted (no orphaned personal files).
  if (previous?.model_path && previous.model_path !== row.model_path) {
    await admin.storage.from(MODEL_BUCKET).remove([previous.model_path]);
  }
}

/** Use the built-in studio character (keeps the saved look). */
export function useDesignedCharacter({ admin, userId }) {
  return saveSource(admin, userId, { provider: "ourplace" });
}

/** Use a gallery character. The id must be in the shipped gallery. */
export async function useGalleryCharacter({ admin, userId, galleryId }) {
  if (!getGalleryModel(galleryId)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  await saveSource(admin, userId, { provider: "library", library_model: galleryId });
}

/**
 * Validates GLB bytes and stores them as the user's model. Shared by imports and
 * provider exports, so every model in storage passed the same checks.
 */
export async function storeValidatedModel({ admin, userId, bytes, provider, extra = {} }) {
  const inspection = inspectCharacterGlb(bytes);
  if (!inspection.ok) {
    reportError(new Error(`Rejected character model: ${inspection.reason}`), { operation: "validate character model", stats: inspection.stats });
    throw new PairingError(PAIRING_ERROR.CHARACTER_MODEL_INVALID, { cause: inspection.reason });
  }
  const path = `${userId}/${randomUUID()}.glb`;
  const upload = await admin.storage.from(MODEL_BUCKET).upload(path, bytes, { contentType: "model/gltf-binary", upsert: false });
  if (upload.error) {
    reportError(upload.error, { operation: "store character model" });
    throw new PairingError(PAIRING_ERROR.UNAVAILABLE);
  }
  try {
    await saveSource(admin, userId, { provider, model_path: path, ...extra });
  } catch (error) {
    await admin.storage.from(MODEL_BUCKET).remove([path]);
    throw error;
  }
  return { path, stats: inspection.stats };
}

/**
 * Step 1 of an import: a one-time signed upload URL for the user's own pending
 * slot. Any earlier unfinished upload is discarded first.
 */
export async function startImport({ admin, userId }) {
  const { data: existing } = await admin.storage.from(MODEL_BUCKET).list(userId, { search: PENDING_PREFIX });
  const stale = (existing ?? []).filter((file) => file.name.startsWith(PENDING_PREFIX)).map((file) => `${userId}/${file.name}`);
  if (stale.length) await admin.storage.from(MODEL_BUCKET).remove(stale);

  const path = `${userId}/${PENDING_PREFIX}${randomUUID()}.glb`;
  const { data, error } = await admin.storage.from(MODEL_BUCKET).createSignedUploadUrl(path);
  if (error) {
    reportError(error, { operation: "start character import" });
    throw new PairingError(PAIRING_ERROR.UNAVAILABLE);
  }
  return { path, token: data.token };
}

/** Step 2: validate the uploaded file and make it the user's character. */
export async function finishImport({ admin, userId, path }) {
  const ownPending = new RegExp(`^${userId}/${PENDING_PREFIX}[0-9a-f-]{36}\\.glb$`);
  if (typeof path !== "string" || !ownPending.test(path)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);

  const { data: blob, error } = await admin.storage.from(MODEL_BUCKET).download(path);
  if (error || !blob) throw new PairingError(PAIRING_ERROR.CHARACTER_MODEL_INVALID);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    return await storeValidatedModel({ admin, userId, bytes, provider: "imported" });
  } finally {
    // The pending upload is never kept: valid files were copied, invalid ones refused.
    await admin.storage.from(MODEL_BUCKET).remove([path]);
  }
}
