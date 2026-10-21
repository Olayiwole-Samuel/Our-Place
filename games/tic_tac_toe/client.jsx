"use client";

import { useEffect, useRef } from "react";
import { playSound } from "@/lib/ui/sounds";

/**
 * Tic Tac Toe board. Receives the server's view and sends intents only
 * (`act("place", { cell })`); the server decides legality and outcome. Everything
 * shared — session, players, connection, leave, result, chat, voice — comes from
 * the game shell (components/lobby/games/GameStage.jsx).
 *
 * Marks are shown as X / O glyphs (not colour alone), and the board is a grid of
 * labelled buttons, so it works by keyboard and screen reader. A new mark pops
 * in, and the winning line glows.
 */
export default function TicTacToe({ view, me, partner, names = {}, status, result, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const turnOf = view.turn.order[view.turn.index];
  const myTurn = status === "active" && turnOf === me;
  const line = new Set(result?.summary?.line ?? view.line ?? []);
  const myMark = view.marks[me];
  const filled = view.cells.filter(Boolean).length;

  // A soft tick for every mark (yours on tap, your partner's when it arrives).
  const lastFilled = useRef(filled);
  useEffect(() => {
    if (filled > lastFilled.current) playSound("move");
    lastFilled.current = filled;
  }, [filled]);

  return (
    <div className="flex flex-col items-center gap-3">
      <p role="status" aria-live="polite" className={`text-caption ${myTurn ? "font-semibold text-green-500" : "text-text-secondary"}`}>
        {status !== "active" ? `You were ${myMark}` : myTurn ? `Your move — you're ${myMark}` : `${partnerName}'s move…`}
      </p>
      <div role="grid" aria-label="Tic Tac Toe board" className="grid grid-cols-3 gap-1.5 rounded-[var(--radius-md)] bg-black-800 p-1.5">
        {view.cells.map((owner, cell) => {
          const mark = owner ? view.marks[owner] : null;
          const playable = myTurn && !owner && !busy;
          const row = Math.floor(cell / 3) + 1;
          const column = (cell % 3) + 1;
          return (
            <button
              key={cell}
              type="button"
              role="gridcell"
              aria-label={`Row ${row}, column ${column}: ${mark ?? "empty"}`}
              aria-disabled={!playable}
              onClick={() => playable && act("place", { cell })}
              className={`grid size-[clamp(3.25rem,14vmin,5rem)] place-items-center rounded-[var(--radius-sm)] text-[clamp(1.5rem,6vmin,2.4rem)] font-semibold transition-colors ${
                line.has(cell) ? "ttt-win bg-green-700/60" : "bg-black-950"
              } ${playable ? "cursor-pointer hover:bg-black-700" : "cursor-default"} ${mark === "X" ? "text-white-soft" : "text-pink-400"}`}
            >
              {mark && (
                <span key={mark} className="ttt-mark">
                  {mark}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
