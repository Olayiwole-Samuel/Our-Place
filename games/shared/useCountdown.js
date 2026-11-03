"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomStore } from "@/store/roomStore";

/**
 * Seconds left until a deadline set by the game server (corrected for this
 * phone's clock), updating a few times a second. `onEnd` runs when it hits zero,
 * and again every few seconds until the deadline changes: the server double-checks
 * the time, so if this phone's clock is ahead, a repeat is what moves things on.
 */
const REPEAT_MS = 3000;

export function useCountdown(deadline, { active = true, onEnd } = {}) {
  const [left, setLeft] = useState(() => remaining(deadline));
  const fired = useRef(0);
  const end = useRef(onEnd);
  end.current = onEnd;

  useEffect(() => {
    if (!active || !deadline) return undefined;
    const tick = () => {
      const value = remaining(deadline);
      setLeft(value);
      if (value <= 0 && Date.now() - fired.current >= REPEAT_MS) {
        fired.current = Date.now();
        end.current?.();
      }
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [deadline, active]);

  return left;
}

function remaining(deadline) {
  if (!deadline) return 0;
  const skew = useRoomStore.getState().skewMs ?? 0;
  return Math.max(0, (deadline - (Date.now() + skew)) / 1000);
}
