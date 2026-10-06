import "server-only";
import { randomUUID } from "node:crypto";
import { reportError } from "@/lib/errors";
import { PAIRING_ERROR, PairingError } from "./errors";

/**
 * Couple photos — four slots that personalise the couple's game boards (first
 * user: the Naija Ludo board). Migration: 20261012000000_couple_photos.sql.
 *
 *   together_a, together_b   two different photos of the couple together
 *   portrait                 one photo per partner (partner A = slot 1, B = slot 2)
 *
 * Reads use the signed-in user's client, so RLS decides which couple: the
 * couple comes from auth.uid(), never from a request. Images are private and
 * handed out as short-lived signed URLs. Writes go through the service role
 * after validating the image. Either partner may set any of their couple's
 * slots — including the partner's portrait, whose owner is resolved from
 * couple membership on the server (never a user id from the request).
 */
export const PHOTO_BUCKET = "couple-photos";
export const PHOTO_SLOTS = Object.freeze(["together_a", "together_b", "portrait"]);
export const MAX_PHOTO_BYTES = 1_572_864; // 1.5 MB — board-sized images (the client downsizes)
const SIGNED_URL_SECONDS = 60 * 60;

const TYPES = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": { ext: "webp", magic: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
};

let tableMissingReported = false;

/** { togetherA, togetherB, partners: [{ userId, slot, url }] } — urls are null when a slot is empty. */
export async function loadCouplePhotos(supabase, userId) {
  const members = await supabase.from("couple_members").select("user_id, slot, couple_id").order("slot");
  if (members.error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: members.error });
  const rows = members.data ?? [];
  if (!rows.some((m) => m.user_id === userId)) throw new PairingError(PAIRING_ERROR.NOT_PAIRED);
  const empty = { togetherA: null, togetherB: null, partners: rows.map((m) => ({ userId: m.user_id, slot: m.slot, url: null })) };

  const photos = await supabase.from("couple_photos").select("slot, user_id, path, updated_at");
  if (photos.error) {
    // Not migrated yet (or briefly unavailable): boards fall back to profile photos.
    if (!tableMissingReported) {
      tableMissingReported = true;
      reportError(photos.error, { operation: "load couple photos" });
    }
    return empty;
  }
  const paths = (photos.data ?? []).map((row) => row.path);
  const signed = new Map();
  if (paths.length) {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) reportError(error, { operation: "sign couple photos" });
    for (const entry of data ?? []) if (entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
  }
  const urlOf = (row) => (row ? (signed.get(row.path) ?? null) : null);
  const bySlot = (slot) => photos.data.find((row) => row.slot === slot);
  return {
    togetherA: urlOf(bySlot("together_a")),
    togetherB: urlOf(bySlot("together_b")),
    partners: empty.partners.map((p) => ({ ...p, url: urlOf(photos.data.find((row) => row.slot === "portrait" && row.user_id === p.userId)) })),
  };
}

/** Decodes and checks a `data:image/…;base64,` upload. Returns { bytes, type } or throws photo_invalid. */
export function parsePhoto(dataUrl) {
  const match = typeof dataUrl === "string" && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new PairingError(PAIRING_ERROR.PHOTO_INVALID);
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 16 || bytes.length > MAX_PHOTO_BYTES || !TYPES[match[1]].magic(bytes)) throw new PairingError(PAIRING_ERROR.PHOTO_INVALID);
  return { bytes, type: match[1] };
}

export const PORTRAIT_OWNERS = Object.freeze(["mine", "partner"]);

/**
 * Stores a photo in one of the caller's couple slots and removes the image it
 * replaces. For a portrait, `whose` is "mine" or "partner".
 */
export async function saveCouplePhoto({ admin, userId, slot, whose = "mine", dataUrl }) {
  if (!PHOTO_SLOTS.includes(slot) || !PORTRAIT_OWNERS.includes(whose)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  const { bytes, type } = parsePhoto(dataUrl);
  const coupleId = await coupleOf(admin, userId);
  const owner = slot === "portrait" ? await portraitOwner(admin, coupleId, userId, whose) : null;
  const path = `${coupleId}/${slot === "portrait" ? `portrait-${owner}` : slot}-${randomUUID().slice(0, 8)}.${TYPES[type].ext}`;

  const upload = await admin.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: type, upsert: false, cacheControl: "3600" });
  if (upload.error) {
    reportError(upload.error, { operation: "store couple photo" });
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  const previous = await existing(admin, coupleId, slot, owner);
  const row = { couple_id: coupleId, slot, user_id: owner, path };
  const write = previous ? await admin.from("couple_photos").update({ path }).eq("id", previous.id) : await admin.from("couple_photos").insert(row);
  if (write.error) {
    await admin.storage.from(PHOTO_BUCKET).remove([path]);
    reportError(write.error, { operation: "record couple photo" });
    throw new PairingError(PAIRING_ERROR.UNKNOWN);
  }
  if (previous) await admin.storage.from(PHOTO_BUCKET).remove([previous.path]);
  return { slot, path };
}

/** Clears one of the caller's couple slots (the board falls back to its default). */
export async function removeCouplePhoto({ admin, userId, slot, whose = "mine" }) {
  if (!PHOTO_SLOTS.includes(slot) || !PORTRAIT_OWNERS.includes(whose)) throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  const coupleId = await coupleOf(admin, userId);
  const owner = slot === "portrait" ? await portraitOwner(admin, coupleId, userId, whose) : null;
  const previous = await existing(admin, coupleId, slot, owner);
  if (!previous) return;
  await admin.from("couple_photos").delete().eq("id", previous.id);
  await admin.storage.from(PHOTO_BUCKET).remove([previous.path]);
}

async function coupleOf(admin, userId) {
  const { data, error } = await admin.from("couple_members").select("couple_id").eq("user_id", userId).maybeSingle();
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
  if (!data) throw new PairingError(PAIRING_ERROR.NOT_PAIRED);
  return data.couple_id;
}

/** The caller, or the other member of the caller's couple — from membership, never the request. */
async function portraitOwner(admin, coupleId, userId, whose) {
  if (whose === "mine") return userId;
  const { data, error } = await admin.from("couple_members").select("user_id").eq("couple_id", coupleId);
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
  const partner = (data ?? []).map((m) => m.user_id).find((id) => id !== userId);
  if (!partner) throw new PairingError(PAIRING_ERROR.NOT_PAIRED);
  return partner;
}

async function existing(admin, coupleId, slot, owner) {
  let query = admin.from("couple_photos").select("id, path").eq("couple_id", coupleId).eq("slot", slot);
  if (slot === "portrait") query = query.eq("user_id", owner);
  const { data, error } = await query.maybeSingle();
  if (error) throw new PairingError(PAIRING_ERROR.UNKNOWN, { cause: error });
  return data;
}
