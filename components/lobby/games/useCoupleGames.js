"use client";

import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/config/env";
import { openCoupleGames } from "@/lib/game/client";
import { reportError } from "@/lib/errors";
import { useGameStore } from "@/store/gameStore";

/**
 * Connects the game system for as long as the living room is open: one
 * subscription to the couple's private `games` topic (created once per mount,
 * removed on unmount), the current session restored on entry, and the
 * authoritative view re-fetched after every event and every reconnect.
 */
export function useCoupleGames({ coupleId, userId }) {
  useEffect(() => {
    const store = useGameStore.getState();
    store.init(userId);
    if (!isSupabaseConfigured()) {
      store.setConnection("closed");
      return undefined;
    }
    let cancelled = false;
    let channel = null;
    store.refreshCurrent();
    import("@/lib/supabase/client")
      .then(({ getSupabaseBrowserClient }) => {
        if (cancelled) return;
        channel = openCoupleGames({
          supabase: getSupabaseBrowserClient(),
          coupleId,
          handlers: {
            onEvent: (event) => useGameStore.getState().onEvent(event),
            onConnection: (status) => useGameStore.getState().setConnection(status),
            onReconnected: () => useGameStore.getState().refresh(),
          },
        });
      })
      .catch((error) => {
        reportError(error, { feature: "games" });
        useGameStore.getState().setConnection("closed");
      });
    return () => {
      cancelled = true;
      channel?.close();
      useGameStore.getState().reset();
    };
  }, [coupleId, userId]);
}
