import "server-only";
import { createHmac } from "node:crypto";

/**
 * Daily.co (voice) — server side only. DAILY_API_KEY never leaves the server.
 *
 * Room model: one PRIVATE Daily room per couple.
 *   name   derived from the couple id with an HMAC keyed by the API key, so it
 *          reveals nothing about the couple and can't be guessed or chosen by a client
 *   access private (a meeting token is required), at most 2 participants,
 *          audio + video start off, no chat/screenshare/recording features
 * Tokens are short-lived, bound to that room, and carry the user's id as the
 * Daily user_id — the client uses it to know which participant is the partner,
 * and it can't be forged because only the server signs tokens.
 *
 * Nothing is recorded, stored or transcribed: the room has no recording or
 * transcription enabled and Our Place never asks Daily for either.
 */
const API = "https://api.daily.co/v1";
const TOKEN_TTL_S = 2 * 60 * 60; // join window; an established call is not cut off at expiry

export function isDailyConfigured() {
  return Boolean(process.env.DAILY_API_KEY);
}

export class DailyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DailyError";
    this.status = status;
  }
}

async function daily(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  // Daily error bodies carry { error, info } — never the key, but we still don't echo them to clients.
  if (!response.ok) throw new DailyError(`daily ${method} ${path.split("/")[1]} → ${response.status} ${data?.error ?? ""}`.trim(), response.status);
  return data;
}

export function coupleRoomName(coupleId) {
  const digest = createHmac("sha256", process.env.DAILY_API_KEY).update(`our-place:voice:${coupleId}`).digest("hex");
  return `op-${digest.slice(0, 32)}`;
}

const ROOM_PROPERTIES = {
  max_participants: 2,
  start_audio_off: true,
  start_video_off: true,
  enable_chat: false,
  enable_screenshare: false,
  enable_knocking: false,
  enable_prejoin_ui: false,
};

/** The couple's room, created on first use. Returns { name, url }. */
async function ensureCoupleRoom(coupleId) {
  const name = coupleRoomName(coupleId);
  try {
    const room = await daily(`/rooms/${name}`);
    return { name: room.name, url: room.url };
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  try {
    const room = await daily("/rooms", { method: "POST", body: { name, privacy: "private", properties: ROOM_PROPERTIES } });
    return { name: room.name, url: room.url };
  } catch (error) {
    // Both partners may arrive at the same moment: the other request created it.
    if (error.status !== 400) throw error;
    const room = await daily(`/rooms/${name}`);
    return { name: room.name, url: room.url };
  }
}

/** Join credentials for this user in their couple's room. */
export async function createVoiceAccess({ coupleId, userId }) {
  const room = await ensureCoupleRoom(coupleId);
  const { token } = await daily("/meeting-tokens", {
    method: "POST",
    body: {
      properties: {
        room_name: room.name,
        user_id: userId,
        is_owner: false,
        start_audio_off: true,
        start_video_off: true,
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
      },
    },
  });
  return { url: room.url, token };
}
