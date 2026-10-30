"use client";

import { Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { SIZE } from "./rules";

/**
 * Reversi board. Renders the server's view and sends intents only:
 *   act("place", { square })   act("resign", {})
 * Your legal squares show a faint dot (from the server's view); the discs a
 * move flips turn over one after another.
 */
const SIDE_NAME = { b: "Black", w: "White" };
const DISC = {
  b: "bg-[radial-gradient(circle_at_35%_30%,#55555c,#1d1d22_60%,#09090b)]",
  w: "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#e8e4da_60%,#b9b3a4)]",
};

export default function Reversi({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const active = status === "active" && !view.ended;
  const myTurn = active && view.turn === me;
  const theirSide = view.mySide === "b" ? "w" : "b";
  const legal = new Set(view.legal);
  const [confirmResign, setConfirmResign] = useState(false);
  const flipped = new Map((view.last?.flipped ?? []).map((square, i) => [square, i]));
  const mountMoves = useRef(view.moves);

  const moves = useRef(view.moves);
  useEffect(() => {
    if (view.moves > moves.current) playSound("move");
    moves.current = view.moves;
  }, [view.moves]);

  const line = !active
    ? null
    : myTurn
      ? view.passed === partner
        ? `${partnerName} has no move — go again!`
        : "Your move"
      : view.passed === me
        ? `You have no move — ${partnerName} goes again`
        : `${partnerName} is thinking…`;

  return (
    <div className="board-game flex w-full flex-col items-center gap-[clamp(8px,2vmin,16px)] sm:flex-row sm:items-start sm:justify-center">
      <div role="grid" aria-label={`Reversi board, you play ${SIDE_NAME[view.mySide]}`} className="square-board relative grid select-none grid-cols-8 grid-rows-8 gap-px overflow-hidden rounded-[var(--radius-md)] bg-[#0d3b22] p-px shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
        {Array.from({ length: SIZE * SIZE }, (_, square) => {
          const disc = view.board[square];
          const playable = myTurn && !busy && legal.has(square);
          const isLast = view.last?.square === square;
          const fresh = view.moves > mountMoves.current;
          return (
            <button
              key={square}
              type="button"
              role="gridcell"
              aria-label={`Row ${Math.floor(square / SIZE) + 1}, column ${(square % SIZE) + 1}: ${disc ? SIDE_NAME[disc].toLowerCase() : playable ? "you can play here" : "empty"}`}
              aria-disabled={!playable}
              onClick={() => playable && act("place", { square })}
              className={`relative grid place-items-center bg-[#17804a] outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-blue-400 ${playable ? "cursor-pointer hover:bg-[#1c9558]" : "cursor-default"}`}
            >
              {disc && (
                <span
                  key={`${square}-${disc}`}
                  aria-hidden="true"
                  className={`size-[80%] rounded-full shadow-[0_2px_3px_rgba(0,0,0,0.45)] ${DISC[disc]} ${fresh && flipped.has(square) ? "reversi-flip" : ""} ${fresh && isLast ? "ttt-mark" : ""}`}
                  style={fresh && flipped.has(square) ? { animationDelay: `${80 + flipped.get(square) * 45}ms` } : undefined}
                />
              )}
              {!disc && playable && <span aria-hidden="true" className={`size-[26%] rounded-full opacity-40 ${DISC[view.mySide]}`} />}
              {isLast && <span aria-hidden="true" className="absolute top-[8%] right-[8%] size-[12%] rounded-full bg-red-500" />}
            </button>
          );
        })}
      </div>

      <aside className="flex w-full max-w-[34rem] flex-col gap-2 sm:w-44">
        <p role="status" aria-live="polite" className={`text-center text-caption sm:text-left ${myTurn ? "font-semibold text-green-500" : "text-text-secondary"}`}>
          {line ?? `You played ${SIDE_NAME[view.mySide]}`}
        </p>
        <div className="flex justify-center gap-4 text-caption sm:flex-col sm:gap-1">
          <span className="flex items-center gap-1.5 text-white-soft">
            <span aria-hidden="true" className={`size-3.5 rounded-full ${DISC[view.mySide]}`} /> You: {view.counts[view.mySide]}
          </span>
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span aria-hidden="true" className={`size-3.5 rounded-full ${DISC[theirSide]}`} /> {partnerName}: {view.counts[theirSide]}
          </span>
        </div>
        {active &&
          (confirmResign ? (
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <button type="button" onClick={() => act("resign", {})} className="min-h-9 rounded-[var(--radius-md)] bg-pink-500 px-3 text-micro font-semibold tracking-normal text-black-950">
                Yes, resign
              </button>
              <button type="button" onClick={() => setConfirmResign(false)} className="min-h-9 px-2 text-micro tracking-normal text-text-muted">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmResign(true)} className="flex min-h-9 items-center justify-center gap-1.5 self-center text-micro tracking-normal text-text-muted hover:text-text-secondary sm:self-start">
              <Flag aria-hidden="true" size={13} /> Resign
            </button>
          ))}
      </aside>
    </div>
  );
}
