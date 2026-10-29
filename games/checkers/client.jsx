"use client";

import { Crown, Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { SIZE, isDark } from "./rules";

/**
 * Checkers board. Renders the server's view and sends intents only:
 *   act("move", { from, to })   one step or one jump; a multi-jump is several, same turn
 *   act("resign", {})
 * Legal moves come from the server's view (it enforces "you must jump"), so the
 * board only offers what the server will accept. Your pieces are at the bottom.
 * The piece that just moved slides in; a captured piece fades out.
 */
const PIECE = {
  b: "bg-[radial-gradient(circle_at_35%_30%,#5a5a62,#26262c_60%,#111114)] text-[#e9c46a] ring-[#0b0b0d]",
  w: "bg-[radial-gradient(circle_at_35%_30%,#fffaf0,#e9dcc0_60%,#bfae8a)] text-[#a2531f] ring-[#9b8a66]",
};
const SIDE_NAME = { b: "Dark", w: "Light" };

export default function Checkers({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const flipped = view.mySide === "w";
  const active = status === "active" && !view.ended;
  const myTurn = active && view.turn === me;
  const [selected, setSelected] = useState(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const mountMoves = useRef(`${view.moves}:${view.last?.to}`);

  // Mid-jump: the jumping piece stays picked up.
  useEffect(() => {
    setSelected(view.chain ?? null);
  }, [view.chain, view.moves, view.last?.to]);

  const lastKey = `${view.moves}:${view.last?.to}`;
  const previous = useRef(lastKey);
  useEffect(() => {
    if (previous.current !== lastKey && view.last) playSound(view.last.captured !== null ? "capture" : "move");
    previous.current = lastKey;
  }, [lastKey, view.last]);

  const targets = selected !== null ? (view.legal[selected] ?? []) : [];
  const movable = new Set(Object.keys(view.legal).map(Number));
  const choose = (square) => {
    if (!myTurn || busy) return;
    if (selected !== null && targets.includes(square)) {
      act("move", { from: selected, to: square });
      return;
    }
    if (view.chain !== null) return; // keep jumping with the same piece
    setSelected(movable.has(square) && square !== selected ? square : null);
  };

  const order = Array.from({ length: SIZE * SIZE }, (_, i) => (flipped ? SIZE * SIZE - 1 - i : i));
  const screen = (square) => {
    const s = flipped ? SIZE * SIZE - 1 - square : square;
    return [s % SIZE, Math.floor(s / SIZE)];
  };
  const last = view.last;
  const slide = last && lastKey !== mountMoves.current ? (() => {
    const [fx, fy] = screen(last.from);
    const [tx, ty] = screen(last.to);
    return { "--dx": fx - tx, "--dy": fy - ty };
  })() : null;

  const theirSide = view.mySide === "b" ? "w" : "b";
  const line = !active
    ? null
    : myTurn
      ? view.chain !== null
        ? "Jump again!"
        : view.mustJump
          ? "You must jump!"
          : "Your move"
      : `${partnerName} is thinking…`;

  return (
    <div className="checkers board-game flex w-full flex-col items-center gap-[clamp(8px,2vmin,16px)] sm:flex-row sm:items-start sm:justify-center">
      <div
        role="grid"
        aria-label={`Checkers board, you play ${SIDE_NAME[view.mySide]}`}
        className="square-board relative grid select-none grid-cols-8 grid-rows-8 overflow-hidden rounded-[var(--radius-md)] shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
      >
        {order.map((square) => {
          const piece = view.board[square];
          const dark = isDark(square);
          const isTarget = targets.includes(square);
          const isSelected = selected === square;
          const isLast = last && (last.from === square || last.to === square);
          const canMove = myTurn && movable.has(square);
          const label = `Square ${square + 1}${piece ? `, ${SIDE_NAME[piece.c].toLowerCase()} ${piece.k ? "king" : "piece"}` : ""}${isTarget ? ", move here" : ""}`;
          return (
            <button
              key={square}
              type="button"
              role="gridcell"
              aria-label={label}
              aria-selected={isSelected}
              tabIndex={dark ? 0 : -1}
              disabled={!dark}
              onClick={() => choose(square)}
              className={`chess-square relative grid place-items-center outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-blue-400 ${dark ? "bg-[#7a4a2a]" : "bg-[#ecd9b4]"}`}
            >
              {isLast && <span aria-hidden="true" className="absolute inset-0 bg-[rgba(214,190,90,0.32)]" />}
              {isSelected && <span aria-hidden="true" className="absolute inset-0 bg-[rgba(125,211,252,0.4)]" />}
              {piece && (
                <span
                  key={slide && last.to === square ? `${square}-${lastKey}` : square}
                  aria-hidden="true"
                  className={`absolute inset-0 grid place-items-center ${slide && last.to === square ? "chess-slide z-[5]" : ""}`}
                  style={slide && last.to === square ? slide : undefined}
                >
                  <span
                    className={`grid size-[78%] place-items-center rounded-full shadow-[0_3px_0_rgba(0,0,0,0.35)] ring-2 ring-inset ${PIECE[piece.c]} ${canMove ? "cursor-pointer" : ""} ${
                      canMove && !isSelected && view.mustJump ? "checkers-must" : ""
                    }`}
                  >
                    <span className="grid size-[70%] place-items-center rounded-full border border-black/15">
                      {piece.k && <Crown aria-hidden="true" className="size-[62%]" strokeWidth={2.4} />}
                    </span>
                  </span>
                </span>
              )}
              {last?.captured === square && !piece && lastKey !== mountMoves.current && (
                <span key={`gone-${lastKey}`} aria-hidden="true" className="checkers-gone absolute inset-[11%] rounded-full bg-white/50" />
              )}
              {isTarget && <span aria-hidden="true" className="absolute size-[32%] rounded-full bg-[rgba(125,211,252,0.65)]" />}
            </button>
          );
        })}
      </div>

      <aside className="flex w-full max-w-[34rem] flex-col gap-2 sm:w-44">
        <p role="status" aria-live="polite" className={`text-center text-caption sm:text-left ${myTurn ? "font-semibold text-green-500" : "text-text-secondary"}`}>
          {line ?? `You played ${SIDE_NAME[view.mySide]}`}
        </p>
        <div className="flex justify-center gap-4 text-micro tracking-normal text-text-muted sm:flex-col sm:gap-1">
          <span>You: {view.pieces[view.mySide]} pieces</span>
          <span>
            {partnerName}: {view.pieces[theirSide]} pieces
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
