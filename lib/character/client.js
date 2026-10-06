import { PAIRING_ERROR, normalizePairingError } from "@/lib/couple/errors";

/**
 * Browser-side character API. Never throws: resolves to { ok: true, data } or
 * { ok: false, code } (same contract as lib/couple/client.js).
 */
async function call(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: PAIRING_ERROR.NETWORK };
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // handled below
  }
  if (!response.ok) {
    return { ok: false, code: normalizePairingError(payload?.error?.code ?? (response.status >= 500 ? PAIRING_ERROR.UNAVAILABLE : PAIRING_ERROR.UNKNOWN)) };
  }
  return payload ? { ok: true, data: payload } : { ok: false, code: PAIRING_ERROR.UNKNOWN };
}

export const characterApi = {
  get: () => call("/api/character"),
  save: (config) => call("/api/character", { method: "PUT", body: { config } }),
  providerToken: () => call("/api/character/provider/token", { method: "POST", body: {} }),
  importProviderModel: (exported) => call("/api/character/provider/import", { method: "POST", body: exported }),
  useDesigned: () => call("/api/character/source", { method: "POST", body: { source: "designed" } }),
  useGallery: (id) => call("/api/character/source", { method: "POST", body: { source: "gallery", id } }),
  startImport: () => call("/api/character/import/start", { method: "POST", body: {} }),
  finishImport: (path) => call("/api/character/import/finish", { method: "POST", body: { path } }),
};
