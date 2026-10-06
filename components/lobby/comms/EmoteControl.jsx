"use client";

import { Smile, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { EMOTE_LIST } from "@/lib/emotes/emotes";
import { HudButton } from "./HudButton";

/**
 * Emote tray: tap 🙂 → a compact tray of seven → tap one. Two taps total.
 * The character performs it immediately (and the partner sees it); the tray
 * stays open so a second reaction is one tap. Keyboard: arrows move, Enter/Space
 * plays, 1–7 play directly, Esc closes.
 */
export function EmoteControl({ onEmote, open, onOpenChange }) {
  const trayId = useId();
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const [played, setPlayed] = useState(null); // brief acknowledgement on the tapped emote
  const [cooling, setCooling] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    itemRefs.current[0]?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!played) return undefined;
    const timer = setTimeout(() => setPlayed(null), 650);
    return () => clearTimeout(timer);
  }, [played]);

  useEffect(() => {
    if (!cooling) return undefined;
    const timer = setTimeout(() => setCooling(false), 450);
    return () => clearTimeout(timer);
  }, [cooling]);

  const play = (id) => {
    if (onEmote(id)) setPlayed(id);
    else setCooling(true); // too soon: a tiny shake instead of a toast
  };

  const onTrayKey = (event) => {
    const index = itemRefs.current.indexOf(document.activeElement);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      itemRefs.current[(index + 1) % EMOTE_LIST.length]?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      itemRefs.current[(index - 1 + EMOTE_LIST.length) % EMOTE_LIST.length]?.focus();
    } else if (/^[1-7]$/.test(event.key)) {
      play(EMOTE_LIST[Number(event.key) - 1].id);
    }
  };

  return (
    <div className="relative">
      {open && (
        <div
          id={trayId}
          role="toolbar"
          aria-label="Emotes"
          aria-orientation="horizontal"
          onKeyDown={onTrayKey}
          className={`panel absolute right-full bottom-0 mr-2 flex items-center gap-1 rounded-[var(--radius-lg)] p-1.5 [animation:panel-in_160ms_var(--ease-out-soft)] motion-reduce:animate-none ${cooling ? "emote-shake" : ""}`}
        >
          {EMOTE_LIST.map((emote, index) => (
            <button
              key={emote.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              aria-label={emote.label}
              title={`${emote.label} (${index + 1})`}
              onClick={() => play(emote.id)}
              className={`group relative grid size-11 place-items-center rounded-[var(--radius-md)] text-[1.35rem] leading-none transition-transform duration-150 hover:bg-black-700 active:scale-90 motion-reduce:transition-none ${
                played === emote.id ? "scale-110 bg-pink-500/20" : ""
              }`}
            >
              <span aria-hidden="true">{emote.glyph}</span>
              <span aria-hidden="true" className="pointer-events-none absolute -top-6 hidden rounded-[var(--radius-xs)] bg-black-950/90 px-1.5 py-0.5 text-micro whitespace-nowrap text-text-secondary group-hover:block group-focus-visible:block">
                {emote.label}
              </span>
            </button>
          ))}
        </div>
      )}
      <HudButton ref={buttonRef} label={open ? "Close emotes" : "Open emotes"} expanded={open} controls={open ? trayId : undefined} tone={open ? "active" : "default"} onClick={() => onOpenChange(!open)}>
        {open ? <X aria-hidden="true" size={19} strokeWidth={1.75} /> : <Smile aria-hidden="true" size={19} strokeWidth={1.75} />}
      </HudButton>
    </div>
  );
}
