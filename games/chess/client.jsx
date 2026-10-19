"use client";

import { Flag, Handshake } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";

/**
 * Chess board. Renders the server's view and sends intents only:
 *   act("move", { from, to, promotion?, ply })  ply = moves seen, so a resend is refused
 *   act("offer_draw" | "accept_draw" | "decline_draw" | "resign", {})
 * Legal targets come from the server's view (chess.js on the server), so the
 * board can only offer moves the server will accept; the server re-checks
 * every one anyway.
 *
 * Input: tap a piece then a square, or drag a piece onto a square (mouse,
 * touch, pen). Keyboard: arrow keys move between squares, Enter/Space picks a
 * piece and drops it, Escape cancels. Each player sees their own side at the bottom.
 */
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
// Solid glyphs for both sides (coloured by CSS); ︎ asks for text, not emoji.
const GLYPH = { k: "♚︎", q: "♛︎", r: "♜︎", b: "♝︎", n: "♞︎", p: "♟︎" };
const NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PROMOTION_CHOICES = ["q", "r", "b", "n"];

const squareName = (row, col) => `${FILES[col]}${8 - row}`;

export default function Chess({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const flipped = view.myColor === "b";
  const active = status === "active" && !view.ended;
  const myTurn = active && view.turn === me;
  const [selected, setSelected] = useState(null);
  const [promotion, setPromotion] = useState(null); // { from, to }
  const [focus, setFocus] = useState(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [drag, setDrag] = useState(null); // { from, x, y }
  const boardRef = useRef(null);
  const historyRef = useRef(null);

  // Rows/columns in screen order (flipped for Black).
  const order = useMemo(() => {
    const idx = [0, 1, 2, 3, 4, 5, 6, 7];
    return flipped ? [...idx].reverse() : idx;
  }, [flipped]);

  // A new position closes any half-made move.
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
    setDrag(null);
  }, [view.ply]);

  // Sounds for the partner's moves and checks (our own play a sound on send).
  const lastPly = useRef(view.ply);
  useEffect(() => {
    if (view.ply > lastPly.current) playSound(view.lastMove?.captured ? "capture" : "move");
    lastPly.current = view.ply;
  }, [view.ply, view.lastMove]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }, [view.history.length]);

  const targets = selected ? (view.legal.targets[selected] ?? []) : [];
  const pieceAt = (square) => {
    const col = FILES.indexOf(square[0]);
    const row = 8 - Number(square[1]);
    return view.board[row]?.[col] ?? null;
  };
  const isMine = (square) => pieceAt(square)?.[0] === view.myColor;

  const send = (from, to, promo) => {
    setSelected(null);
    setPromotion(null);
    playSound("move");
    act("move", { from, to, ...(promo ? { promotion: promo } : {}), ply: view.ply });
  };
  const tryMove = (from, to) => {
    if (!(view.legal.targets[from] ?? []).includes(to)) return false;
    if (view.legal.promotions.includes(`${from}${to}`)) setPromotion({ from, to });
    else send(from, to);
    return true;
  };
  const choose = (square) => {
    if (!myTurn || busy) return;
    if (selected && tryMove(selected, square)) return;
    if (isMine(square) && view.legal.targets[square]?.length) setSelected(square === selected ? null : square);
    else setSelected(null);
  };

  // Drag: start on your own movable piece, drop on a legal square.
  const onPointerDown = (event, square) => {
    if (!myTurn || busy || !isMine(square) || !view.legal.targets[square]?.length || event.button > 0) return;
    setSelected(square);
    setDrag({ from: square, x: event.clientX, y: event.clientY, moved: false, id: event.pointerId });
  };
  useEffect(() => {
    if (!drag) return undefined;
    const move = (event) => {
      if (event.pointerId !== drag.id) return;
      setDrag((current) => current && { ...current, x: event.clientX, y: event.clientY, moved: current.moved || Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6 });
    };
    const up = (event) => {
      if (event.pointerId !== drag.id) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-square]")?.dataset.square;
      const wasDrag = drag.moved;
      setDrag(null);
      if (wasDrag && target && target !== drag.from) tryMove(drag.from, target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // tryMove reads the latest view through closure on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  // Keyboard: roving focus over the 64 squares.
  const onKeyDown = (event) => {
    const current = focus ?? (flipped ? "e8" : "e1");
    const col = FILES.indexOf(current[0]);
    const rank = Number(current[1]);
    const delta = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (delta) {
      event.preventDefault();
      const [dx, dy] = flipped ? [-delta[0], -delta[1]] : delta;
      const next = `${FILES[Math.min(7, Math.max(0, col + dx))]}${Math.min(8, Math.max(1, rank + dy))}`;
      setFocus(next);
      boardRef.current?.querySelector(`[data-square="${next}"]`)?.focus();
    } else if (event.key === "Escape") {
      setSelected(null);
      setPromotion(null);
    }
  };

  const myCaptures = view.captured[view.myColor === "w" ? "b" : "w"] ?? [];
  const theirCaptures = view.captured[view.myColor] ?? [];
  const material = (list) => list.reduce((sum, type) => sum + VALUE[type], 0);
  const lead = material(myCaptures) - material(theirCaptures);
  const offeredToMe = view.drawOffer && view.drawOffer !== me;
  const iOffered = view.drawOffer === me;

  const statusLine = !active
    ? null
    : myTurn
      ? view.inCheck
        ? "Check! Your move — protect your king."
        : "Your move"
      : view.inCheck
        ? `Check on ${partnerName}!`
        : `${partnerName} is thinking…`;

  return (
    <div className="chess board-game flex w-full flex-col items-center gap-[clamp(8px,2vmin,16px)] sm:flex-row sm:items-start sm:justify-center">
      <div className="flex w-full min-w-0 flex-col items-center gap-1.5 sm:w-auto sm:flex-1">
        <CapturedRow className="chess-captured-board" pieces={theirCaptures} color={view.myColor} lead={-lead} label={`Taken by ${partnerName}`} />
        <div
          ref={boardRef}
          role="grid"
          aria-label={`Chess board, you play ${view.myColor === "w" ? "White" : "Black"}`}
          onKeyDown={onKeyDown}
          className="square-board relative grid select-none grid-cols-8 grid-rows-8 overflow-hidden rounded-[var(--radius-md)] shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
          style={{ touchAction: "none" }}
        >
          {order.map((row) => (
            <div key={row} role="row" className="contents">
              {order.map((col) => {
                const square = squareName(row, col);
                const piece = view.board[row][col];
                const light = (row + col) % 2 === 0;
                const isTarget = targets.includes(square);
                const isLast = view.lastMove && (view.lastMove.from === square || view.lastMove.to === square);
                const isCheck = view.checkSquare === square;
                const isSelected = selected === square;
                const showRank = col === order[0];
                const showFile = row === order[7];
                const label = `${square}${piece ? `, ${piece[0] === "w" ? "white" : "black"} ${NAME[piece[1]]}` : ""}${isTarget ? ", move here" : ""}`;
                return (
                  <button
                    key={square}
                    type="button"
                    role="gridcell"
                    data-square={square}
                    tabIndex={(focus ?? (flipped ? "e8" : "e1")) === square ? 0 : -1}
                    aria-label={label}
                    aria-selected={isSelected}
                    onClick={() => choose(square)}
                    onFocus={() => setFocus(square)}
                    onPointerDown={(event) => onPointerDown(event, square)}
                    className={`chess-square relative grid place-items-center outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-blue-400 ${light ? "chess-light" : "chess-dark"}`}
                  >
                    {isLast && <span aria-hidden="true" className="absolute inset-0 bg-[rgba(214,190,90,0.38)]" />}
                    {isSelected && <span aria-hidden="true" className="absolute inset-0 bg-[rgba(125,211,252,0.42)]" />}
                    {isCheck && <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle,rgba(239,68,68,0.85)_0%,rgba(239,68,68,0.25)_55%,transparent_75%)]" />}
                    {showRank && <span aria-hidden="true" className={`chess-coord absolute top-[3%] left-[5%] ${light ? "text-[#5f6f45]" : "text-[#e9e4d4]"}`}>{8 - row}</span>}
                    {showFile && <span aria-hidden="true" className={`chess-coord absolute right-[5%] bottom-[2%] ${light ? "text-[#5f6f45]" : "text-[#e9e4d4]"}`}>{FILES[col]}</span>}
                    {piece && (
                      <span
                        aria-hidden="true"
                        className={`chess-piece relative ${piece[0] === "w" ? "chess-white" : "chess-black"} ${drag?.from === square && drag.moved ? "opacity-30" : ""} ${myTurn && piece[0] === view.myColor && view.legal.targets[square]?.length ? "cursor-grab" : ""}`}
                      >
                        {GLYPH[piece[1]]}
                      </span>
                    )}
                    {isTarget && (
                      <span
                        aria-hidden="true"
                        className={`absolute rounded-full ${piece ? "inset-[6%] border-[0.45cqw] border-[rgba(20,24,18,0.45)]" : "size-[30%] bg-[rgba(20,24,18,0.38)]"}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {drag?.moved && (
            <span
              aria-hidden="true"
              className={`chess-piece chess-drag pointer-events-none fixed z-50 ${view.myColor === "w" ? "chess-white" : "chess-black"}`}
              style={{ left: drag.x, top: drag.y }}
            >
              {GLYPH[pieceAt(drag.from)?.[1] ?? "p"]}
            </span>
          )}
          {promotion && (
            <div role="dialog" aria-label="Promote your pawn" className="absolute inset-0 z-20 grid place-items-center bg-black-950/70">
              <div className="panel flex flex-col items-center gap-2 rounded-[var(--radius-md)] p-3">
                <p className="text-caption font-semibold text-white-soft">Promote to…</p>
                <div className="flex gap-2">
                  {PROMOTION_CHOICES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-label={NAME[type]}
                      onClick={() => send(promotion.from, promotion.to, type)}
                      className={`chess-piece grid size-14 place-items-center rounded-[var(--radius-sm)] bg-[#e9e4d4] text-[2.4rem] hover:bg-white ${view.myColor === "w" ? "chess-white" : "chess-black"}`}
                    >
                      {GLYPH[type]}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setPromotion(null)} className="min-h-9 text-caption text-text-secondary hover:text-white-soft">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <CapturedRow className="chess-captured-board" pieces={myCaptures} color={view.myColor === "w" ? "b" : "w"} lead={lead} label="Taken by you" />
      </div>

      <aside className="chess-aside flex w-full flex-col gap-2 sm:w-[11rem] sm:shrink-0">
        <p role="status" aria-live="polite" className={`text-caption font-semibold ${myTurn ? "text-green-500" : view.inCheck ? "text-pink-400" : "text-text-secondary"}`}>
          {statusLine ?? "Game over"}
        </p>
        <p className="text-micro tracking-normal text-text-muted">
          You play <span className="font-semibold text-white-soft">{view.myColor === "w" ? "White" : "Black"}</span>
        </p>
        {/* Short landscape phones: captured pieces live here instead of around the board. */}
        <div className="chess-captured-aside flex flex-col gap-0.5">
          <CapturedRow pieces={theirCaptures} color={view.myColor} lead={-lead} label={`Taken by ${partnerName}`} />
          <CapturedRow pieces={myCaptures} color={view.myColor === "w" ? "b" : "w"} lead={lead} label="Taken by you" />
        </div>

        {offeredToMe && active && (
          <div role="alert" className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] bg-black-800 p-2">
            <p className="text-caption text-white-soft">{partnerName} offers a draw.</p>
            <div className="flex gap-1.5">
              <button type="button" disabled={busy} onClick={() => act("accept_draw", {})} className="min-h-9 flex-1 rounded-[var(--radius-sm)] bg-green-600 text-caption font-semibold text-white">
                Accept
              </button>
              <button type="button" disabled={busy} onClick={() => act("decline_draw", {})} className="min-h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-caption text-white-soft">
                Decline
              </button>
            </div>
          </div>
        )}

        <ol ref={historyRef} aria-label="Moves" className="chess-history grid max-h-[9.5rem] short:max-h-[5.5rem] grid-cols-[1.6rem_1fr_1fr] gap-x-1 overflow-y-auto overscroll-contain rounded-[var(--radius-sm)] bg-black-950/60 p-1.5 text-micro tracking-normal sm:max-h-[min(18rem,40dvh)]">
          {view.history.length === 0 && <li className="col-span-3 py-1 text-text-muted">No moves yet — White starts.</li>}
          {Array.from({ length: Math.ceil(view.history.length / 2) }, (_, i) => (
            <li key={i} className="contents">
              <span className="text-text-muted">{i + 1}.</span>
              <span className="text-white-soft">{view.history[i * 2]}</span>
              <span className="text-white-soft">{view.history[i * 2 + 1] ?? ""}</span>
            </li>
          ))}
        </ol>

        {active && (
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy || Boolean(view.drawOffer)}
              onClick={() => act("offer_draw", {})}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-caption text-white-soft disabled:opacity-50"
            >
              <Handshake aria-hidden="true" size={14} /> {iOffered ? "Offered" : "Draw"}
            </button>
            {confirmResign ? (
              <button type="button" disabled={busy} onClick={() => act("resign", {})} className="min-h-10 flex-1 rounded-[var(--radius-sm)] bg-pink-500 text-caption font-semibold text-black-950">
                Resign?
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmResign(true);
                  setTimeout(() => setConfirmResign(false), 3500);
                }}
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-caption text-white-soft"
              >
                <Flag aria-hidden="true" size={14} /> Resign
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function CapturedRow({ pieces, color, lead, label, className = "" }) {
  const sorted = [...pieces].sort((a, b) => VALUE[b] - VALUE[a]);
  return (
    <div aria-label={label} className={`square-board-row flex h-5 items-center gap-0.5 text-[1rem] leading-none ${className}`}>
      {sorted.map((type, index) => (
        <span key={`${type}${index}`} aria-hidden="true" className={`chess-piece chess-mini ${color === "w" ? "chess-white" : "chess-black"}`}>
          {GLYPH[type]}
        </span>
      ))}
      {lead > 0 && <span className="ml-1 text-micro tracking-normal text-text-muted">+{lead}</span>}
      <span className="sr-only">{sorted.length ? sorted.map((type) => NAME[type]).join(", ") : "none"}</span>
    </div>
  );
}
