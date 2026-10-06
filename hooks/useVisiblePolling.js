"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `intervalMs` while the tab is visible, and once
 * immediately whenever the tab becomes visible again. Pauses in background tabs
 * so a waiting screen doesn't drain battery or hammer the API.
 */
export function useVisiblePolling(callback, intervalMs, enabled = true) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const tick = () => saved.current();
    const start = () => {
      if (timer === null && document.visibilityState === "visible") timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
