import "server-only";
import { PAIRING_ERROR, PairingError, pairingErrorFromDatabase } from "@/lib/couple/errors";
import { reportError } from "@/lib/errors";
import { galleryModelDescriptor } from "./gallery";
import { normalizeCharacterConfig } from "./schema";

/**
 * Character data access — the application-level operations every surface uses
 * (living room, studio, future game rooms): getMyCharacter / getPartnerCharacter
 * via loadCharacters, and saveCharacterConfig. Runs as the signed-in user, so RLS
 * bounds every read and write; the user id is always the verified session's.
 *
 * Client-facing character (provider details stay server-side):
 *   { userId, provider: "ourplace" | "library" | "imported" | "metaperson", version, config,
 *     model: { key, url } | null, updatedAt }
 * `model.url` is a short-lived signed URL; `model.key` is the stable storage path,
 * used as the cache key so the same model is never downloaded twice.
 */
export const MODEL_BUCKET = "character-models";
const SIGNED_URL_SECONDS = 60 * 60;
const COLUMNS = "user_id, provider, version, config, model_path, library_model, updated_at";

function check(result, operation) {
  if (result.error) {
    reportError(result.error, { operation });
    throw new PairingError(pairingErrorFromDatabase(result.error), { cause: result.error });
  }
  return result.data;
}

function modelFor(row, signedUrls) {
  if (row.provider === "library") return galleryModelDescriptor(row.library_model);
  if (row.model_path && signedUrls.get(row.model_path)) return { key: row.model_path, url: signedUrls.get(row.model_path) };
  return null;
}

function toCharacter(row, signedUrls) {
  return {
    userId: row.user_id,
    provider: row.provider,
    version: row.version,
    config: normalizeCharacterConfig(row.config),
    // Rendered model (gallery file, or a signed URL to a private model); null = built-in character.
    model: modelFor(row, signedUrls),
    updatedAt: row.updated_at,
  };
}

/** The user's and (if paired) their partner's characters. Either may be null. */
export async function loadCharacters(supabase, { userId, partnerId = null }) {
  const ids = partnerId ? [userId, partnerId] : [userId];
  const rows = check(await supabase.from("characters").select(COLUMNS).in("user_id", ids), "load characters");

  // Models live in a private bucket: hand out short-lived signed URLs (RLS lets
  // the owner and their partner sign them; nobody else can).
  const paths = rows.map((row) => row.model_path).filter(Boolean);
  const signedUrls = new Map();
  if (paths.length) {
    const { data, error } = await supabase.storage.from(MODEL_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) reportError(error, { operation: "sign character models" });
    for (const entry of data ?? []) if (entry.signedUrl && !entry.error) signedUrls.set(entry.path, entry.signedUrl);
  }

  const byUser = new Map(rows.map((row) => [row.user_id, toCharacter(row, signedUrls)]));
  return { mine: byUser.get(userId) ?? null, partner: partnerId ? (byUser.get(partnerId) ?? null) : null };
}

/**
 * Saves the user's look. The config is normalised (unknown ids replaced, numbers
 * clamped) before it reaches the database; the row is always the caller's own.
 * Saving a look never touches a provider model — it only updates `config`.
 */
export async function saveCharacterConfig(supabase, userId, rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new PairingError(PAIRING_ERROR.INVALID_REQUEST);
  }
  const config = normalizeCharacterConfig(rawConfig);

  const existing = check(await supabase.from("characters").select("user_id").eq("user_id", userId).maybeSingle(), "find character");
  if (existing) {
    check(await supabase.from("characters").update({ config }).eq("user_id", userId), "update character");
  } else {
    check(await supabase.from("characters").insert({ user_id: userId, config }), "create character");
  }
  const { mine } = await loadCharacters(supabase, { userId });
  return mine;
}
