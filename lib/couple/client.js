import { PAIRING_ERROR, normalizePairingError } from "./errors";

/**
 * Browser-side calls to the couple API. Never throws: every call resolves to
 * { ok: true, data } or { ok: false, code } so callers can keep the user's input
 * and show the right message. Identity travels only in the session cookie.
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
    // Non-JSON (e.g. a proxy error page) is handled below.
  }

  if (!response.ok) {
    const code = payload?.error?.code ?? (response.status >= 500 ? PAIRING_ERROR.UNAVAILABLE : PAIRING_ERROR.UNKNOWN);
    return { ok: false, code: normalizePairingError(code) };
  }
  if (!payload) return { ok: false, code: PAIRING_ERROR.UNKNOWN };
  return { ok: true, data: payload };
}

export const coupleApi = {
  getState: () => call("/api/couple"),
  createInvite: () => call("/api/couple/invite", { method: "POST", body: {} }),
  join: (code) => call("/api/couple/join", { method: "POST", body: { code } }),
  setNickname: (nickname) => call("/api/couple/nickname", { method: "POST", body: { nickname } }),
};
