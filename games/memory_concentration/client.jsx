"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";

/**
 * Memory board. Renders the server's view (faces only for cards that are face
 * up) and sends intents only: act("flip", { index }). Cards flip over in 3D; a
 * found pair gets a ring in the finder's colour (and "You" / their initial);
 * a missed pair stays up for a moment, then turns back over.
 */
const MISS_SHOWN_MS = 1500;

export default function Memory({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const myTurn = status === "active" && view.current === me;
  const [hideMissed, setHideMissed] = useState(false);

  // A miss shows both faces briefly, then they turn back (the server keeps them up until the next flip).
  const missKey = view.missed.join(",");
  useEffect(() => {
    setHideMissed(false);
    if (!view.missed.length) return undefined;
    const timer = setTimeout(() => setHideMissed(true), MISS_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [missKey, view.missed.length]);

  const flips = useRef(view.flips);
  useEffect(() => {
    if (view.flips > flips.current) playSound(view.lastMatch ? "capture" : "move");
    flips.current = view.flips;
  }, [view.flips, view.lastMatch]);

  const matched = new Set(view.lastMatch ?? []);
  const line =
    status !== "active"
      ? null
      : myTurn
        ? view.open.length
          ? "Now find its pair…"
          : view.lastMatch
            ? "A pair! Go again ❤️"
            : "Your turn — flip a card"
        : view.lastMatch
          ? `${partnerName} found a pair…`
          : `${partnerName}'s turn…`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full max-w-[36rem] items-center justify-between gap-3 text-micro tracking-normal">
        <span className={`rounded-full px-2.5 py-1 ${myTurn ? "bg-green-700/45 text-white-soft" : "bg-black-800 text-text-secondary"}`}>You · {view.pairs[me] ?? 0} pairs</span>
        <p role="status" aria-live="polite" className={`text-caption ${myTurn ? "font-semibold text-green-500" : "text-text-secondary"}`}>
          {line}
        </p>
        <span className={`rounded-full px-2.5 py-1 ${!myTurn && status === "active" ? "bg-pink-500/25 text-white-soft" : "bg-black-800 text-text-secondary"}`}>
          {partnerName} · {view.pairs[partner] ?? 0}
        </span>
      </div>
      <div role="grid" aria-label="Memory cards" className="grid grid-cols-6 gap-[clamp(4px,1.2vmin,8px)]">
        {view.cards.map((card, index) => {
          const missed = view.missed.includes(index);
          const up = Boolean(card.face) && !(missed && hideMissed);
          const playable = myTurn && !busy && !card.owner && !view.open.includes(index);
          const mine = card.owner === me;
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              aria-label={up ? `Card ${index + 1}: ${card.face}${card.owner ? `, found by ${mine ? "you" : partnerName}` : ""}` : `Card ${index + 1}, face down`}
              aria-disabled={!playable}
              onClick={() => playable && act("flip", { index })}
              className={`memory-card relative aspect-[3/4] w-[clamp(2.3rem,min(9vmin,13vw),4.4rem)] [perspective:600px] ${playable ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className={`memory-inner absolute inset-0 [transform-style:preserve-3d] ${up ? "[transform:rotateY(180deg)]" : ""}`}>
                <span
                  aria-hidden="true"
                  className={`absolute inset-0 grid place-items-center rounded-[var(--radius-sm)] border border-pink-400/30 bg-[repeating-linear-gradient(45deg,#3b1830_0_6px,#4a1d3c_6px_12px)] text-[0.9rem] [backface-visibility:hidden] ${
                    playable ? "hover:brightness-125" : ""
                  }`}
                >
                  ❤️
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute inset-0 grid place-items-center rounded-[var(--radius-sm)] bg-white-soft text-[clamp(1.1rem,4.5vmin,2rem)] [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                    card.owner ? (mine ? "ring-2 ring-green-500" : "ring-2 ring-pink-400") : missed ? "ring-2 ring-black-700" : ""
                  } ${matched.has(index) ? "memory-match" : ""} ${card.owner && !matched.has(index) ? "opacity-70" : ""}`}
                >
                  {card.face}
                  {card.owner && (
                    <span className={`absolute right-0.5 bottom-0.5 rounded-full px-1 text-[0.5rem] leading-tight font-bold text-black-950 ${mine ? "bg-green-500" : "bg-pink-400"}`}>
                      {mine ? "You" : partnerName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
