"use client";

import { useSyncExternalStore } from "react";

/** Live result of a CSS media query. Server render assumes `serverValue`. */
export function useMediaQuery(query, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** True on touch-first devices (phones, tablets), where on-screen controls are needed. */
export function useCoarsePointer() {
  return useMediaQuery("(pointer: coarse)");
}
