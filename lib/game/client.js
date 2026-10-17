import { COUPLE_CHANNEL, coupleChannelName } from "@/lib/realtime/channels";
import { gameSessionErrorMessage } from "./sessionErrors";
import { openResilientChannel } from "@/lib/realtime/resilientChannel";

/**
 * Browser side of game sessions.
 *
 *   gameApi        the session API (never throws: { ok, data } | { ok: false, code, message, detail })
 *   openCoupleGames  the couple's PRIVATE `games` topic. Events are written by the
 *                    database (clients can't send there) and are compact
 *                    ({ event, id, status, players, ready, version, … }); the
 *                    client re-fetches its own authoritative view after each one.
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
    return { ok: false, code: "unavailable", message: gameSessionErrorMessage("unavailable") };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error?.code ?? (response.status >= 500 ? "unavailable" : "unknown");
    return { ok: false, code, message: payload?.error?.message ?? gameSessionErrorMessage(code), detail: payload?.error?.detail ?? null };
  }
  return { ok: true, data: payload ?? {} };
}

const base = "/api/games/sessions";

export const gameApi = {
  current: () => call(`${base}/current`),
  view: (id) => call(`${base}/${id}`),
  create: (gameId) => call(base, { method: "POST", body: { gameId } }),
  join: (id) => call(`${base}/${id}/join`, { method: "POST", body: {} }),
  ready: (id, ready) => call(`${base}/${id}/ready`, { method: "POST", body: { ready } }),
  action: (id, action) => call(`${base}/${id}/action`, { method: "POST", body: action }),
  leave: (id) => call(`${base}/${id}/leave`, { method: "POST", body: {} }),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts only well-formed session events. */
export function toSessionEvent(payload) {
  if (!payload || typeof payload !== "object" || !UUID.test(payload.id ?? "")) return null;
  if (typeof payload.event !== "string" || typeof payload.status !== "string") return null;
  return {
    event: payload.event,
    id: payload.id,
    gameId: String(payload.gameId ?? ""),
    status: payload.status,
    players: Array.isArray(payload.players) ? payload.players.filter((p) => typeof p === "string") : [],
    ready: Array.isArray(payload.ready) ? payload.ready.filter((p) => typeof p === "string") : [],
    version: Number.isInteger(payload.version) ? payload.version : 0,
    createdBy: typeof payload.createdBy === "string" ? payload.createdBy : null,
  };
}

/**
 * handlers: onEvent(event), onConnection("connecting"|"live"|"reconnecting"|"closed"),
 *           onReconnected() — re-fetch authoritative state (never trust stale local state).
 */
export function openCoupleGames({ supabase, coupleId, handlers }) {
  let closed = false;
  let subscribedOnce = false;
  handlers.onConnection("connecting");
  const live = openResilientChannel({
    supabase,
    topic: coupleChannelName(coupleId, COUPLE_CHANNEL.GAMES),
    options: { config: { private: true } },
    area: "games",
    bind: (channel) =>
      channel.on("broadcast", { event: "session" }, ({ payload }) => {
        const event = toSessionEvent(payload);
        if (event) handlers.onEvent(event);
      }),
    onStatus: (status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") {
        handlers.onConnection("live");
        if (subscribedOnce) handlers.onReconnected?.();
        subscribedOnce = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        handlers.onConnection("reconnecting"); // a closed channel is rejoined
      }
    },
  });
  return {
    async close() {
      if (closed) return;
      closed = true;
      await live.close();
    },
  };
}
