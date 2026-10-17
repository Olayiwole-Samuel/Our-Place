"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicEnv } from "@/lib/config/env";
import { logConnection } from "@/lib/diagnostics/connectionLog";
import { keepRealtimeAlive } from "@/lib/realtime/watchdog";

let browserClient;

/**
 * Browser Supabase client (anon key, user session from cookies).
 * Every query it makes is constrained by Row Level Security — it must never be
 * trusted to establish identity or couple membership on its own.
 * One instance is shared per tab so auth listeners and realtime sockets are not duplicated.
 */
export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const { url, anonKey } = requireSupabasePublicEnv();
    browserClient = createBrowserClient(url, anonKey, {
      // Send Realtime heartbeats from a Web Worker (the library's built-in
      // script, no download). Browsers throttle timers in background tabs; this
      // keeps presence, chat delivery and voice signaling connected while the
      // tab is hidden instead of timing out.
      realtime: { worker: true },
    });
    // Phones kill sockets (screen lock, app switch, network change); revive it
    // so presence, chat, voice and games come back by themselves.
    if (typeof window !== "undefined") {
      keepRealtimeAlive(browserClient.realtime, { log: logConnection });
      // Heartbeat trouble is the first sign of a dying socket.
      browserClient.realtime.onHeartbeat?.((status) => {
        if (status === "timeout" || status === "error" || status === "disconnected") logConnection("socket", `heartbeat ${status}`);
      });
    }
  }
  return browserClient;
}
