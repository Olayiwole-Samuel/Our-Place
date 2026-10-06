"use client";

import { create } from "zustand";
import { createPeerVoiceSession } from "@/lib/voice/peerVoiceSession";
import { createVoiceSession } from "@/lib/voice/voiceSession";

/**
 * Voice state — the only place voice state lives. The call itself is
 * encapsulated in lib/voice/peerVoiceSession.js (direct) or voiceSession.js
 * (Daily); this store owns ONE session per
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
 * Voice provider: "p2p" (default — direct browser-to-browser WebRTC, free) or
 * "daily" (Daily.co rooms; needs DAILY_API_KEY and a Daily account with a
 * payment method on file). Both expose the same session interface.
 */
export const VOICE_PROVIDER = process.env.NEXT_PUBLIC_VOICE_PROVIDER === "daily" ? "daily" : "p2p";

function createSession({ coupleId, userId, partnerId, onState }) {
  if (VOICE_PROVIDER === "daily") return createVoiceSession({ fetchAccess, partnerId, onState });
  return createPeerVoiceSession({
    getSupabase: () => import("@/lib/supabase/client").then(({ getSupabaseBrowserClient }) => getSupabaseBrowserClient()),
    coupleId,
    userId,
    partnerId,
    onState,
  });
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

async function fetchAccess() {
  let response;
  try {
    response = await fetch("/api/voice/token", {
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
  if (!response.ok || !payload?.url || !payload?.token) {
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
      session = createSession({ coupleId, userId, partnerId, onState: (patch) => set(patch) });
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
