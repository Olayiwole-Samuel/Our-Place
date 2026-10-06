"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns `value`, updated at most once per `intervalMs` while it keeps changing,
 * and always settling on the latest value (trailing update). Used so expensive
 * work driven by rapid input — e.g. rebuilding the 3D character while a slider
 * is dragged — stays smooth.
 */
export function useThrottledValue(value, intervalMs) {
  const [throttled, setThrottled] = useState(value);
  const lastRun = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const wait = Math.max(0, intervalMs - (now - lastRun.current));
    const timer = setTimeout(() => {
      lastRun.current = Date.now();
      setThrottled(value);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, intervalMs]);

  return throttled;
}
