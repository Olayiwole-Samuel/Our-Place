import "server-only";
import { PAIRING_ERROR, PairingError } from "@/lib/couple/errors";
import { reportError } from "@/lib/errors";
import { MAX_MODEL_BYTES } from "./glb";
import { storeValidatedModel } from "./sources.server";

/**
 * MetaPerson adapter (server side).
 *
 * Credentials (server-only, never NEXT_PUBLIC_):
 *   METAPERSON_CLIENT_ID / METAPERSON_CLIENT_SECRET — from an Avatar SDK
 *     "Client Access" application (accounts.avatarsdk.com/developer). Client
 *     Access tokens can only reach avatars created through that client.
 *   METAPERSON_EXPORT_HOSTS (optional) — comma-separated hostnames the exported
 *     model may be downloaded from. Default: avatarsdk.com and its subdomains.
 *
 * Flow:
 *   1. getAccessToken(): OAuth2 client_credentials at api.avatarsdk.com, cached
 *      until shortly before expiry. Only this short-lived token reaches the
 *      browser (MetaPerson Creator's `authenticate` message accepts it), never
 *      the client secret.
 *   2. The browser sends the selfie straight to MetaPerson Creator (iframe) —
 *      Our Place never receives or stores it.
 *   3. importExport(): the exported GLB URL (temporary) is downloaded here,
 *      inspected (real GLB, size limit, skinned FULL-BODY humanoid), copied into
 *      the private character-models bucket, and recorded on the user's character.
 */
const TOKEN_URL = "https://api.avatarsdk.com/o/token/";
const DOWNLOAD_TIMEOUT_MS = 60_000;

export function isMetaPersonConfigured() {
  return Boolean(process.env.METAPERSON_CLIENT_ID && process.env.METAPERSON_CLIENT_SECRET);
}

let cachedToken = null; // { value, expiresAt }

export async function getAccessToken({ now = Date.now(), fetchImpl = fetch } = {}) {
  if (!isMetaPersonConfigured()) throw new PairingError(PAIRING_ERROR.PROVIDER_UNAVAILABLE);
  if (cachedToken && cachedToken.expiresAt - 5 * 60_000 > now) {
    return { accessToken: cachedToken.value, expiresIn: Math.floor((cachedToken.expiresAt - now) / 1000) };
  }
  const basic = Buffer.from(`${process.env.METAPERSON_CLIENT_ID}:${process.env.METAPERSON_CLIENT_SECRET}`).toString("base64");
  let response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
  } catch (error) {
    reportError(error, { operation: "metaperson token" });
    throw new PairingError(PAIRING_ERROR.PROVIDER_UNAVAILABLE);
  }
  if (!response.ok) {
    // Never log the body: it may echo credentials.
    reportError(new Error(`MetaPerson token request failed with HTTP ${response.status}`), { operation: "metaperson token" });
    throw new PairingError(PAIRING_ERROR.PROVIDER_UNAVAILABLE);
  }
  const body = await response.json();
  if (typeof body.access_token !== "string") throw new PairingError(PAIRING_ERROR.PROVIDER_UNAVAILABLE);
  cachedToken = { value: body.access_token, expiresAt: now + (Number(body.expires_in) || 3600) * 1000 };
  return { accessToken: cachedToken.value, expiresIn: Math.floor((cachedToken.expiresAt - now) / 1000) };
}

export function resetTokenCacheForTests() {
  cachedToken = null;
}

/** Only download from the provider's own hosts (no SSRF to internal addresses). */
export function isAllowedExportUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const hosts = (process.env.METAPERSON_EXPORT_HOSTS || "avatarsdk.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const hostname = url.hostname.toLowerCase();
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

async function downloadModel(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_MODEL_BYTES) throw new Error("too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_MODEL_BYTES) throw new Error("too_large");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Imports a MetaPerson export as the user's character. `admin` is the
 * service-role client (storage writes and provider columns are server-only);
 * `userId` is the verified session user — never taken from the request.
 */
export async function importExport({ admin, userId, url, avatarCode, avatarState, fetchImpl = fetch }) {
  if (!isMetaPersonConfigured()) throw new PairingError(PAIRING_ERROR.PROVIDER_UNAVAILABLE);
  if (!isAllowedExportUrl(url)) throw new PairingError(PAIRING_ERROR.CHARACTER_MODEL_INVALID);

  let bytes;
  try {
    bytes = await downloadModel(url, fetchImpl);
  } catch (error) {
    reportError(error, { operation: "metaperson download" }); // URL deliberately not logged
    throw new PairingError(PAIRING_ERROR.CHARACTER_GENERATION_FAILED);
  }

  return storeValidatedModel({
    admin,
    userId,
    bytes,
    provider: "metaperson",
    extra: {
      provider_ref: typeof avatarCode === "string" ? avatarCode.slice(0, 200) : null,
      // Lets the user reopen MetaPerson Creator with their customisation later.
      provider_state: typeof avatarState === "string" && avatarState.length < 200_000 ? safeJson(avatarState) : null,
    },
  });
}

function safeJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}
