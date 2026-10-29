"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { COLUMNS, ROWS, landingRow } from "./rules";

/**
 * Connect 4 board. Renders the server's view and sends intents only
 * (`act("drop", { column })`). Tap a column (or use ← → and Enter) to drop a
 * disc; the newest disc falls into place and a winning four glows. Discs are
 * red and yellow AND marked (● / ◆) so they don't rely on colour alone.
 */
const DISC = {
  red: "bg-[radial-gradient(circle_at_35%_30%,#ff8a8a,#e0324b_55%,#a3162d)]",
  yellow: "bg-[radial-gradient(circle_at_35%_30%,#fff3a6,#f5c518_55%,#b8860b)]",
};
const MARK = { red: "●", yellow: "◆" };

export default function ConnectFour({ view, me, partner, names = {}, status, result, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const turnOf = view.turn.order[view.turn.index];
  const myTurn = status === "active" && turnOf === me && !view.line;
  const myColor = view.colors[me];
  const line = new Set(result?.summary?.line ?? view.line ?? []);
  const [hover, setHover] = useState(null);
  const filled = view.cells.filter(Boolean).length;
  const full = (column) => Boolean(view.cells[column]);

  const lastFilled = useRef(filled);
  useEffect(() => {
    if (filled > lastFilled.current) playSound("move");
    lastFilled.current = filled;
  }, [filled]);

  const drop = (column) => {
    if (!myTurn || busy || full(column)) return;
    act("drop", { column });
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setHover((current) => Math.min(COLUMNS - 1, Math.max(0, (current ?? 3) + (event.key === "ArrowLeft" ? -1 : 1))));
    } else if ((event.key === "Enter" || event.key === " ") && hover !== null) {
      event.preventDefault();
      drop(hover);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <p role="status" aria-live="polite" className={`text-caption ${myTurn ? "font-semibold text-green-500" : "text-text-secondary"}`}>
        {status !== "active" ? `You were ${myColor}` : myTurn ? `Your move — you're ${myColor} ${MARK[myColor]}` : `${partnerName}'s move…`}
      </p>
      <div
        role="grid"
        aria-label="Connect 4 board. Choose a column to drop your disc."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHover(null)}
        className="grid gap-[clamp(2px,0.8vmin,5px)] rounded-[var(--radius-md)] bg-[#1d3fa8] p-[clamp(4px,1.2vmin,8px)] shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)] outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}
      >
        {Array.from({ length: ROWS * COLUMNS }, (_, cell) => {
          const row = Math.floor(cell / COLUMNS);
          const column = cell % COLUMNS;
          const owner = view.cells[cell];
          const color = owner ? view.colors[owner] : null;
          const isLast = view.last && view.last.row === row && view.last.column === column;
          const playable = myTurn && !busy && !full(column);
          return (
            <button
              key={cell}
              type="button"
              role="gridcell"
              tabIndex={-1}
              aria-label={`Column ${column + 1}, row ${ROWS - row}: ${color ?? "empty"}`}
              aria-disabled={!playable}
              onClick={() => drop(column)}
              onPointerEnter={() => setHover(column)}
              className={`relative grid size-[clamp(1.6rem,min(7vmin,10vw),3.1rem)] place-items-center rounded-full ${
                hover === column && playable ? "bg-[#0f2470]" : "bg-[#0b1a52]"
              } ${playable ? "cursor-pointer" : "cursor-default"}`}
            >
              {color && (
                <span
                  key={`${cell}-${color}`}
                  className={`c4-disc grid size-[86%] place-items-center rounded-full text-[0.6rem] text-black/30 ${DISC[color]} ${line.has(cell) ? "c4-win" : ""}`}
                  style={isLast ? { "--rows": row + 1 } : { animation: "none" }}
                >
                  {MARK[color]}
                </span>
              )}
              {!color && hover === column && playable && row === landingRow(view.cells, column) && (
                <span aria-hidden="true" className={`size-[86%] rounded-full opacity-35 ${DISC[myColor]}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
