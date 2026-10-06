"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { GRAPHICS_PREFERENCES } from "@/lib/performance/profiles";
import { setSoundsEnabled, soundsEnabled, subscribeSounds } from "@/lib/ui/sounds";
import { usePerformanceStore } from "@/store/performanceStore";
import { useAuthStore } from "@/store/authStore";

/**
 * Small account menu in the world's corner. Deliberately contains no
 * leave/unpair/partner controls — pairing is permanent by design.
 */
export function AccountMenu({ beforeSignOut }) {
  const email = useAuthStore((state) => state.user?.email);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="panel grid size-[var(--control-size)] place-items-center rounded-[var(--radius-md)] text-text-secondary transition-colors hover:text-white-soft"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
          <circle cx="4" cy="9" r="1.5" />
          <circle cx="9" cy="9" r="1.5" />
          <circle cx="14" cy="9" r="1.5" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            id={menuId}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="panel absolute top-full right-0 z-20 mt-2 flex w-60 origin-top-right flex-col gap-2 rounded-[var(--radius-md)] p-2"
          >
            {email && <p className="truncate px-2 pt-1 text-caption text-text-muted">{email}</p>}
            <Link
              href="/character"
              className="flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-body text-white-soft hover:bg-black-800"
            >
              My character
            </Link>
            <SoundToggle />
            <GraphicsSetting />
            <SignOutButton variant="secondary" size="md" className="w-full" beforeSignOut={beforeSignOut} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SoundToggle() {
  const enabled = useSyncExternalStore(subscribeSounds, soundsEnabled, () => true);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setSoundsEnabled(!enabled)}
      className="flex min-h-11 items-center justify-between rounded-[var(--radius-md)] px-3 text-body text-white-soft hover:bg-black-800"
    >
      Sounds
      <span className="text-caption text-text-muted">{enabled ? "On" : "Off"}</span>
    </button>
  );
}

/** Graphics quality: human labels only (technical values live in the developer overlay). */
function GraphicsSetting() {
  const preference = usePerformanceStore((state) => state.preference);
  const current = GRAPHICS_PREFERENCES.find((option) => option.id === preference) ?? GRAPHICS_PREFERENCES[0];
  return (
    <fieldset className="flex flex-col gap-1 rounded-[var(--radius-md)] px-3 py-2">
      <legend className="text-body text-white-soft">Graphics</legend>
      <div role="radiogroup" aria-label="Graphics quality" className="mt-1 grid grid-cols-2 gap-1">
        {GRAPHICS_PREFERENCES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={preference === option.id}
            onClick={() => usePerformanceStore.getState().setPreference(option.id)}
            className={`min-h-9 rounded-[var(--radius-sm)] px-2 text-caption transition-colors ${
              preference === option.id ? "bg-green-600 text-white" : "bg-black-800 text-text-secondary hover:text-white-soft"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-micro tracking-normal text-text-muted">{current.description}</p>
    </fieldset>
  );
}
