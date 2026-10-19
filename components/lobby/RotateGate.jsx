"use client";

import { Maximize, Minimize, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * Phones play Our Place sideways. A phone (touch screen, short side under
 * 600px) held upright sees "Turn your phone sideways" instead of the world —
 * boards, cards and the room don't fit a portrait phone. Tablets and computers
 * are never gated.
 *
 * "Rotate for me" goes full screen and locks landscape where the browser
 * allows it (Android Chrome; an installed app is landscape via the manifest).
 * Full screen also hides the browser bar, which gives short phones back height.
 */
export const PHONE_PORTRAIT = "(pointer: coarse) and (orientation: portrait) and (max-width: 599px)";
export const PHONE = "(pointer: coarse) and (max-height: 599px), (pointer: coarse) and (max-width: 599px)";

export async function goLandscapeFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
  } catch {
    // Full screen refused (e.g. iOS Safari): the player rotates the phone themselves.
  }
  try {
    await screen.orientation?.lock?.("landscape");
  } catch {
    // Orientation lock is only allowed in full screen on some browsers.
  }
}

export function RotateGate() {
  const portrait = useMediaQuery(PHONE_PORTRAIT);
  if (!portrait) return null;
  return (
    <div role="alertdialog" aria-label="Turn your phone sideways" className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-5 bg-black-950 p-8 text-center">
      <span aria-hidden="true" className="rotate-hint grid size-20 place-items-center rounded-[var(--radius-lg)] border border-[var(--border-strong)] text-white-soft">
        <RotateCw size={34} strokeWidth={1.6} />
      </span>
      <div>
        <p className="text-subheading font-semibold text-white-soft">Turn your phone sideways</p>
        <p className="mt-1 text-caption text-text-secondary">Our Place is played in landscape — the room, boards and cards need the width.</p>
      </div>
      <button type="button" onClick={goLandscapeFullscreen} className="min-h-12 rounded-[var(--radius-md)] bg-green-600 px-6 text-body font-semibold text-white">
        Rotate for me
      </button>
    </div>
  );
}

/** Full-screen toggle for phones in landscape (more height without the browser bar). */
export function FullscreenButton() {
  const phone = useMediaQuery(PHONE);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const update = () => setFull(Boolean(document.fullscreenElement));
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (!phone || typeof document === "undefined" || !document.documentElement.requestFullscreen) return null;
  return (
    <button
      type="button"
      aria-label={full ? "Exit full screen" : "Full screen"}
      title={full ? "Exit full screen" : "Full screen"}
      onClick={() => (full ? document.exitFullscreen?.() : goLandscapeFullscreen())}
      className="panel grid size-[var(--control-size)] place-items-center rounded-[var(--radius-md)] text-text-secondary hover:text-white-soft"
    >
      {full ? <Minimize aria-hidden="true" size={17} /> : <Maximize aria-hidden="true" size={17} />}
    </button>
  );
}
