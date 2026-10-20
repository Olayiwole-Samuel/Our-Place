"use client";

import { m } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRoomStore } from "@/store/roomStore";

/**
 * Frame for the room's panels (notes, memories, TV, trophies): floats over the
 * living room like a game, never navigates away. Chat and voice stay on top
 * and usable. Escape or ✕ closes it.
 */
export function RoomPanel({ title, icon, wide = false, children, actions = null }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) useRoomStore.getState().closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="room-stage pointer-events-none absolute inset-0 z-30 grid place-items-center safe-inset">
      <m.section
        role="dialog"
        aria-modal="false"
        aria-label={title}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`room-panel panel pointer-events-auto flex flex-col overflow-hidden rounded-[var(--radius-lg)] shadow-[0_24px_64px_rgba(0,0,0,0.5)] ${wide ? "room-panel-wide" : ""}`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] py-2 pr-2 pl-4 short:py-1">
          {icon && (
            <span aria-hidden="true" className="text-text-secondary">
              {icon}
            </span>
          )}
          <h2 className="flex-1 truncate text-caption font-semibold text-white-soft">{title}</h2>
          {actions}
          <button ref={closeRef} type="button" aria-label="Close" onClick={() => useRoomStore.getState().closePanel()} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft">
            <X aria-hidden="true" size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </m.section>
    </div>
  );
}

/** "5 min ago" style relative time for notes and memories. */
export function ago(iso, now = Date.now()) {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
