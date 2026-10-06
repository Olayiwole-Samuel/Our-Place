"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { useWorldStore } from "@/store/worldStore";
import { INTERACTION_HANDLERS } from "./interactionHandlers";

const pop = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: 6, transition: { duration: 0.12 } },
};

/**
 * Contextual interact control. Appears only when something is in reach.
 * Touch: a large button. Keyboard: the same button plus an "E" key hint.
 */
export function InteractPrompt({ onInteract, touch }) {
  const target = useWorldStore((state) => state.interactionTarget);
  const cardOpen = useWorldStore((state) => Boolean(state.activeInteraction));
  const show = target && !cardOpen;

  return (
    <AnimatePresence>
      {show && (
        <m.div key={target.id} {...pop} className="pointer-events-auto">
          <Button
            size="lg"
            variant={target.type === "couch" ? "relationship" : "secondary"}
            onClick={onInteract}
            className={touch ? "min-h-14 px-6" : ""}
            aria-label={`${target.verb}: ${target.label}`}
          >
            {!touch && (
              <kbd aria-hidden="true" className="rounded-[var(--radius-xs)] border border-current/30 px-1.5 font-mono text-caption">
                E
              </kbd>
            )}
            <span className="flex flex-col items-start leading-tight">
              <span>{target.verb}</span>
              <span className="text-caption opacity-75">{target.label}</span>
            </span>
          </Button>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Info card for objects whose feature arrives later. Closes on Esc, ✕, or walking away. */
export function ObjectCard() {
  const activeId = useWorldStore((state) => state.activeInteraction);
  const target = useWorldStore((state) => state.interactionTarget);
  const close = useWorldStore((state) => state.closeInteraction);
  const closeButton = useRef(null);

  // Walking away from the object closes its card.
  useEffect(() => {
    if (activeId && target?.id !== activeId) close();
  }, [activeId, target, close]);

  useEffect(() => {
    if (activeId) closeButton.current?.focus();
  }, [activeId]);

  const handler = activeId && target ? INTERACTION_HANDLERS[target.type] : null;

  return (
    <AnimatePresence>
      {handler?.kind === "card" && (
        <m.section
          key={activeId}
          {...pop}
          role="dialog"
          aria-modal="false"
          aria-labelledby="object-card-title"
          className="panel pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 p-5 short:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="micro-caps text-text-muted">{target.label}</p>
              <h2 id="object-card-title" className="text-subheading text-white-soft">
                {handler.title}
              </h2>
            </div>
            <button
              ref={closeButton}
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:bg-black-800 hover:text-white-soft"
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="text-body text-text-secondary">{handler.body}</p>
        </m.section>
      )}
    </AnimatePresence>
  );
}

/** While seated: a gentle reminder of how to get up. */
export function SeatedHint({ touch }) {
  const seated = useWorldStore((state) => state.seated);
  return (
    <AnimatePresence>
      {seated && (
        <m.p {...pop} role="status" className="panel rounded-[var(--radius-md)] px-4 py-2 text-caption text-text-secondary">
          {touch ? "Use the joystick to get up" : "Press a movement key to get up"}
        </m.p>
      )}
    </AnimatePresence>
  );
}
