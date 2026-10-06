"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errors";

/**
 * Registers /sw.js in production only — a service worker in development would
 * cache stale bundles and fight hot reload.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      reportError(error, { feature: "service-worker" });
    });
  }, []);

  return null;
}
