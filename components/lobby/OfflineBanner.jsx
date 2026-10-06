"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onChange) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Our Place is live and two-person; it can't work offline and doesn't pretend
 * to. When the device loses its connection the world keeps rendering (nothing
 * freezes) and this calm notice explains why chat, voice and presence pause.
 * Everything reconnects by itself when the network returns.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="panel pointer-events-auto mx-auto flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-caption text-white-soft">
      <WifiOff aria-hidden="true" size={15} className="text-text-muted" />
      You&apos;re offline. Reconnect to stay in Our Place.
    </div>
  );
}
