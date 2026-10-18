"use client";

import { create } from "zustand";
import { logConnection } from "@/lib/diagnostics/connectionLog";
import { createAgoraVoiceSession } from "@/lib/voice/agoraVoiceSession";
import { createPeerVoiceSession } from "@/lib/voice/peerVoiceSession";
import { createVoiceSession } from "@/lib/voice/voiceSession";

/**
 * Voice state — the only place voice state lives. The call itself is
 * encapsulated in lib/voice/agoraVoiceSession.js (Agora), peerVoiceSession.js
 * (direct) or voiceSession.js (Daily); this store owns ONE session per
 * page and exposes plain state + three actions to the UI.
 *
 *   status      "idle" | "connecting" | "connected" | "reconnecting" | "disconnected"
 *               | "unavailable" (not configured) | "error"
 *   micEnabled  transmitting (mic OFF by default — the user turns it on)
 *   micPending  waiting for the browser's permission prompt
 *   permissionDenied, micUnsupported, audioBlocked (tap needed to hear), error
 *   partner     { connected, muted, speaking } — from the real connection, never simulated
 *
 * Continuity: release() keeps the call alive briefly so moving between spaces
 * (living room → future game room) reuses it instead of reconnecting.
 */
const LINGER_MS = 4000;

/**
 * Voice provider. By default Agora when the server has it configured
 * (AGORA_APP_ID + AGORA_APP_CERTIFICATE), otherwise direct browser-to-browser
 * WebRTC. NEXT_PUBLIC_VOICE_PROVIDER=daily selects Daily.co instead, and
 * NEXT_PUBLIC_VOICE_PROVIDER=p2p forces direct voice. All expose the same
 * session interface.
 */
export const VOICE_PROVIDER = ["daily", "p2p"].includes(process.env.NEXT_PUBLIC_VOICE_PROVIDER) ? process.env.NEXT_PUBLIC_VOICE_PROVIDER : "auto";

function createPeerSession({ coupleId, userId, partnerId, onState }) {
  return createPeerVoiceSession({
    getSupabase: () => import("@/lib/supabase/client").then(({ getSupabaseBrowserClient }) => getSupabaseBrowserClient()),
    getIceServers: fetchIceServers,
    coupleId,
    userId,
    partnerId,
    onState,
  });
}

function createSession(options) {
  if (VOICE_PROVIDER === "daily") return createVoiceSession({ fetchAccess: () => fetchAccess("/api/voice/token"), partnerId: options.partnerId, onState: options.onState });
  if (VOICE_PROVIDER === "p2p") return createPeerSession(options);
  return createAutoSession(options);
}

/**
 * Agora when the server has credentials for it, else direct voice. Decided on
 * connect (one request), then every call goes to the chosen session.
 */
export function createAutoSession(options, { agora = createAgoraVoiceSession, peer = createPeerSession, fetchAgoraAccess = () => fetchAccess("/api/voice/agora") } = {}) {
  let inner = null;
  let destroyed = false;
  let pendingMic = null;
  return {
    async connect() {
      let first = null;
      try {
        first = await fetchAgoraAccess();
      } catch (error) {
        if (error?.code !== "voice_unavailable") first = error; // Agora is set up but unreachable: let its session retry
      }
      if (destroyed) return;
      if (first) {
        let handed = first instanceof Error ? null : first;
        const fetchAgora = async () => {
          if (handed) {
            const access = handed;
            handed = null;
            return access;
          }
          return fetchAgoraAccess();
        };
        inner = agora({ fetchAccess: fetchAgora, partnerId: options.partnerId, onState: options.onState });
      } else {
        inner = peer(options);
      }
      await inner.connect();
      if (pendingMic !== null) inner.setMic(pendingMic);
    },
    setMic(enabled) {
      if (inner) return inner.setMic(enabled);
      pendingMic = enabled;
      return undefined;
    },
    unlockAudio: () => inner?.unlockAudio(),
    retryNow: () => inner?.retryNow(),
    async destroy() {
      destroyed = true;
      await inner?.destroy();
    },
  };
}

const initialState = {
  status: "idle",
  micEnabled: false,
  micPending: false,
  permissionDenied: false,
  micUnsupported: false,
  audioBlocked: false,
  error: null,
  partner: { connected: false, muted: true, speaking: false },
};

let session = null;
let sessionKey = null;
let users = 0;
let lingerTimer = null;

/** STUN + TURN (when configured) from the server; null → the session's STUN defaults. */
async function fetchIceServers() {
  try {
    const response = await fetch("/api/voice/ice", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    return Array.isArray(payload?.iceServers) ? payload.iceServers : null;
  } catch {
    return null;
  }
}

async function fetchAccess(path) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    throw Object.assign(new Error("network"), { code: "network" });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.token) {
    throw Object.assign(new Error("voice"), { code: payload?.error?.code ?? "voice_failed" });
  }
  return payload;
}

export const useVoiceStore = create((set, get) => ({
  ...initialState,

  /** Join (or keep) the couple's voice session. Returns a release function. */
  acquire({ coupleId, userId, partnerId }) {
    clearTimeout(lingerTimer);
    lingerTimer = null;
    users += 1;
    const key = `${coupleId}:${userId}:${partnerId}`;
    if (session && sessionKey !== key) get().shutdown();
    if (!session) {
      sessionKey = key;
      set({ ...initialState, status: "connecting" });
      session = createSession({
        coupleId,
        userId,
        partnerId,
        onState: (patch) => {
          if (patch.status && patch.status !== get().status) logConnection("voice", patch.status);
          if (patch.error && patch.error !== get().error) logConnection("voice", `error ${patch.error}`);
          if (patch.partner && patch.partner.connected !== get().partner.connected) logConnection("voice", patch.partner.connected ? "partner connected" : "partner not connected");
          set(patch);
        },
      });
      session.connect();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      users = Math.max(0, users - 1);
      if (users === 0) lingerTimer = setTimeout(() => get().shutdown(), LINGER_MS);
    };
  },

  toggleMic() {
    const { micEnabled, micPending, status } = get();
    if (!session || micPending || status !== "connected") return;
    session.setMic(!micEnabled);
  },

  unlockAudio: () => session?.unlockAudio(),
  retry: () => session?.retryNow(),

  /** Leave now: stops tracks, listeners and timers (sign-out, page hide, idle). */
  shutdown() {
    clearTimeout(lingerTimer);
    lingerTimer = null;
    const current = session;
    session = null;
    sessionKey = null;
    set(initialState);
    return current?.destroy();
  },
}));
