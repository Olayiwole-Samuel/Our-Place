"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { guideFor } from "@/lib/game/guides";

/**
 * "How to play" panel for a game (lib/game/guides.js). Opens over everything
 * (the game keeps running underneath); Escape or the close button returns.
 */
export function GameGuide({ definition, onClose }) {
  const guide = guideFor(definition.id);
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  if (!guide) return null;
  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-black-950/60 p-3 safe-inset" onClick={onClose}>
      <section
        role="dialog"
        aria-label={`How to play ${definition.name}`}
        onClick={(event) => event.stopPropagation()}
        className="panel flex max-h-full w-[min(36rem,100%)] flex-col overflow-hidden rounded-[var(--radius-lg)] shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
      >
        <header className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2 pr-2 pl-4">
          <span aria-hidden="true" className="text-[1.2rem]">
            {definition.icon}
          </span>
          <h2 className="flex-1 text-caption font-semibold text-white-soft">How to play {definition.name}</h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft">
            <X aria-hidden="true" size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-caption text-text-secondary">
          <p className="mb-3 text-body font-semibold text-white-soft">{guide.goal}</p>
          {guide.sections.map((section) => (
            <div key={section.title} className="mb-3">
              <h3 className="mb-1 micro-caps text-pink-400">{section.title}</h3>
              <ul className="list-disc space-y-1 pl-4">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          {guide.tips?.length > 0 && (
            <div className="rounded-[var(--radius-sm)] bg-black-800/70 p-2.5">
              <h3 className="mb-1 micro-caps text-green-500">Tips</h3>
              <ul className="list-disc space-y-1 pl-4">
                {guide.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
