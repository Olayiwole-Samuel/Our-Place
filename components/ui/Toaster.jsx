"use client";

import { AnimatePresence, m } from "motion/react";
import { useToastStore } from "@/store/toastStore";

const TONES = {
  neutral: "bg-green-600",
  success: "bg-green-500",
  relationship: "bg-pink-400",
  error: "bg-red-500",
};

/**
 * Renders feedback toasts (top-centre, clear of the safe area and of the HUD's
 * corners). A polite live region announces each message; errors are assertive.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2"
      style={{ paddingTop: "calc(var(--safe-top) + var(--edge-gap))" }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex max-w-[min(28rem,calc(100vw-2rem))] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 py-2.5 pr-2 pl-3.5 text-caption text-white-soft shadow-[var(--shadow-tactile)]"
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${TONES[t.tone] ?? TONES.neutral}`} />
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="grid size-7 place-items-center rounded-[var(--radius-xs)] text-text-muted hover:bg-black-700 hover:text-white-soft"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
