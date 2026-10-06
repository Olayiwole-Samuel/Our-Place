/**
 * API outcome codes (pairing, characters) and the only copy users ever see for
 * them. Shared by the API (status codes) and the client (messages). Raw database or Supabase errors
 * are never shown — unknown failures become "unknown".
 */
export const PAIRING_ERROR = Object.freeze({
  NOT_AUTHENTICATED: "not_authenticated",
  PROFILE_MISSING: "profile_missing",
  INVALID_REQUEST: "invalid_request",
  INVALID_CODE: "invalid_code",
  SELF_PAIR: "self_pair",
  ALREADY_PAIRED: "already_paired",
  INVITE_UNAVAILABLE: "invite_unavailable",
  COUPLE_COMPLETE: "couple_complete",
  RATE_LIMITED: "rate_limited",
  NOT_PAIRED: "not_paired",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  CHARACTER_GENERATION_FAILED: "character_generation_failed",
  CHARACTER_MODEL_INVALID: "character_model_invalid",
  PHOTO_INVALID: "photo_invalid",
  VOICE_UNAVAILABLE: "voice_unavailable",
  VOICE_FAILED: "voice_failed",
  NETWORK: "network",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown",
});

const DETAILS = {
  not_authenticated: { status: 401, message: "Your session ended. Sign in again to continue." },
  profile_missing: { status: 409, message: "We're still setting up your profile. Try again in a moment." },
  invalid_request: { status: 400, message: "Something went wrong. Try again." },
  invalid_code: { status: 400, message: "That invite code isn't valid." },
  self_pair: { status: 409, message: "You can't use your own invite." },
  already_paired: { status: 409, message: "You're already paired." },
  invite_unavailable: { status: 410, message: "This invite is no longer available." },
  couple_complete: { status: 409, message: "This couple is already complete." },
  rate_limited: { status: 429, message: "Too many tries. Wait a few minutes, then try again." },
  not_paired: { status: 403, message: "Pair with your person first." },
  provider_unavailable: { status: 503, message: "Creating a character from a photo isn't available yet." },
  character_generation_failed: { status: 502, message: "We couldn't create your character yet." },
  character_model_invalid: { status: 422, message: "That character couldn't be used. Try again or design your look instead." },
  photo_invalid: { status: 422, message: "That photo couldn't be used. Try a JPG, PNG or WebP under 1.5 MB." },
  voice_unavailable: { status: 503, message: "Voice isn't set up yet." },
  voice_failed: { status: 502, message: "Voice couldn't connect. Try again in a moment." },
  network: { status: 503, message: "We couldn't connect right now." },
  unavailable: { status: 503, message: "We couldn't reach Our Place right now." },
  unknown: { status: 500, message: "Something went wrong. Try again." },
};

const KNOWN = new Set(Object.values(PAIRING_ERROR));

export function normalizePairingError(code) {
  return KNOWN.has(code) ? code : PAIRING_ERROR.UNKNOWN;
}

export function pairingErrorMessage(code) {
  return DETAILS[normalizePairingError(code)].message;
}

export function pairingErrorStatus(code) {
  return DETAILS[normalizePairingError(code)].status;
}

/** Errors worth an automatic "Try again" (the input is kept). */
export function isRetryablePairingError(code) {
  return code === PAIRING_ERROR.NETWORK || code === PAIRING_ERROR.UNAVAILABLE || code === PAIRING_ERROR.UNKNOWN;
}

/** Maps a Supabase/PostgREST error raised as 'pairing:<reason>' to a code. */
export function pairingErrorFromDatabase(error) {
  const message = error?.message ?? "";
  const match = /^pairing:([a-z_]+)$/.exec(message);
  if (match) return normalizePairingError(match[1]);
  if (/fetch failed|network|ECONNREFUSED|ETIMEDOUT/i.test(message)) return PAIRING_ERROR.UNAVAILABLE;
  return PAIRING_ERROR.UNKNOWN;
}

/** A pairing failure with a known code; safe to show to the user. */
export class PairingError extends Error {
  constructor(code, { cause } = {}) {
    super(code, { cause });
    this.name = "PairingError";
    this.code = normalizePairingError(code);
  }
}
