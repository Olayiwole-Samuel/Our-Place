"use client";

import { Flag, RotateCcw, Shuffle, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { CENTER, LETTER_VALUES, SIZE, premiumAt } from "./board";
import { evaluatePlacement } from "./scoring";

/**
 * Word board. Renders the server's view and sends intents only:
 *   act("place", { tiles: [{ id, row, col, letter? }], turn })  letter = a blank's letter
 *   act("exchange", { ids, turn }) · act("pass", { turn }) · act("resign", {})
 * Tiles are placed locally first (tap a rack tile, then a square; tap a placed
 * tile to take it back). The points shown are a preview — the server checks
 * the words against its word list and computes the real score.
 */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const PREMIUM_STYLE = {
  TW: "bg-[#b4413c] text-[#fde9e4]",
  DW: "bg-[#e7a29a] text-[#5b1d18]",
  TL: "bg-[#3f6f9e] text-[#e3f0fb]",
  DL: "bg-[#a9cbe6] text-[#18344d]",
};
const PREMIUM_SHORT = { TW: "3W", DW: "2W", TL: "3L", DL: "2L" };

export default function WordBoard({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const active = status === "active" && !view.ended;
  const myTurn = active && view.current === me;
  const [order, setOrder] = useState(() => view.rack.map((tile) => tile.id)); // rack order (local)
  const [selected, setSelected] = useState(null); // rack tile id
  const [pending, setPending] = useState([]); // [{ id, row, col, letter?, blank }]
  const [blankFor, setBlankFor] = useState(null); // { id, row, col }
  const [swapMode, setSwapMode] = useState(false);
  const [swapIds, setSwapIds] = useState([]);
  const [zoom, setZoom] = useState(false);
  const [confirm, setConfirm] = useState(null); // "pass" | "resign"
  const scroller = useRef(null);

  // Keep the local rack order in step with the server's rack.
  const rackIds = view.rack.map((tile) => tile.id).join();
  useEffect(() => {
    setOrder((current) => {
      const ids = view.rack.map((tile) => tile.id);
      return [...current.filter((id) => ids.includes(id)), ...ids.filter((id) => !current.includes(id))];
    });
  }, [rackIds, view.rack]);

  // A new turn clears anything half-done.
  useEffect(() => {
    setPending([]);
    setSelected(null);
    setSwapMode(false);
    setSwapIds([]);
    setConfirm(null);
  }, [view.turn]);

  const lastTurn = useRef(view.turn);
  useEffect(() => {
    if (view.turn > lastTurn.current && view.lastMove?.by !== me) playSound(view.lastMove?.type === "place" ? "card" : "move");
    lastTurn.current = view.turn;
  }, [view.turn, view.lastMove, me]);

  const rackById = useMemo(() => Object.fromEntries(view.rack.map((tile) => [tile.id, tile])), [view.rack]);
  const usedIds = new Set(pending.map((p) => p.id));
  const rack = order.map((id) => rackById[id]).filter(Boolean);
  const pendingAt = (row, col) => pending.find((p) => p.row === row && p.col === col);
  const lastCells = new Set(view.lastMove?.type === "place" ? view.lastMove.cells : []);

  const preview = useMemo(() => {
    if (!pending.length) return null;
    const placed = pending.map((p) => ({ row: p.row, col: p.col, letter: p.blank ? p.letter : rackById[p.id]?.letter, blank: p.blank }));
    if (placed.some((p) => !p.letter)) return null;
    return evaluatePlacement(view.board, placed);
  }, [pending, view.board, rackById]);

  const tapSquare = (row, col) => {
    if (!myTurn || busy || swapMode) return;
    const existing = pendingAt(row, col);
    if (existing) {
      setPending((current) => current.filter((p) => p !== existing)); // back to the rack
      return;
    }
    if (view.board[`${row},${col}`] || !selected) return;
    const tile = rackById[selected];
    if (tile.letter === "?") {
      setBlankFor({ id: tile.id, row, col });
      return;
    }
    setPending((current) => [...current, { id: tile.id, row, col, blank: false }]);
    setSelected(null);
    playSound("move");
  };

  const tapRack = (id) => {
    if (!active) return;
    if (swapMode) {
      setSwapIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
      return;
    }
    if (usedIds.has(id)) return;
    setSelected((current) => (current === id ? null : id));
  };

  const play = () => {
    if (!pending.length || busy) return;
    act("place", { tiles: pending.map(({ id, row, col, blank, letter }) => ({ id, row, col, ...(blank ? { letter } : {}) })), turn: view.turn });
  };
  const shuffle = () => setOrder((current) => [...current].sort(() => Math.random() - 0.5));
  const recall = () => {
    setPending([]);
    setSelected(null);
  };

  // Zooming in scrolls the first placed tile (or the centre) into view.
  useEffect(() => {
    if (!zoom || !scroller.current) return;
    const target = pending[0] ?? { row: CENTER, col: CENTER };
    const cell = scroller.current.scrollWidth / SIZE;
    scroller.current.scrollTo({ left: target.col * cell - scroller.current.clientWidth / 2 + cell / 2, top: target.row * cell - scroller.current.clientHeight / 2 + cell / 2 });
    // Only when zoom changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const score = (id) => view.scores[id] ?? 0;
  const statusLine = !active ? null : myTurn ? (swapMode ? "Pick the tiles to swap" : pending.length ? "Tap Play when your word is ready" : selected ? "Now tap a square" : "Your turn — tap a tile, then a square") : `${partnerName} is playing…`;

  return (
    <div className="words board-game flex w-full flex-col items-center gap-[clamp(8px,1.8vmin,14px)] sm:flex-row sm:items-start sm:justify-center">
      <div className="flex w-full min-w-0 flex-col items-center gap-1.5 sm:w-auto sm:flex-1">
        <div ref={scroller} className={`square-board relative overflow-auto overscroll-contain rounded-[var(--radius-md)] bg-[#1d2a20] shadow-[0_8px_30px_rgba(0,0,0,0.45)] ${zoom ? "" : "overflow-hidden"}`}>
          <div role="grid" aria-label="Word board" className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-[1px] p-[1px]" style={{ width: zoom ? "200%" : "100%", aspectRatio: "1" }}>
            {Array.from({ length: SIZE }, (_, row) =>
              Array.from({ length: SIZE }, (_, col) => {
                const placed = view.board[`${row},${col}`];
                const mine = pendingAt(row, col);
                const premium = premiumAt(row, col);
                const letter = placed?.letter ?? (mine ? (mine.blank ? mine.letter : rackById[mine.id]?.letter) : null);
                const blank = placed?.blank ?? mine?.blank;
                const label = `Row ${row + 1}, column ${col + 1}${letter ? `: ${letter}` : premium ? `: ${premium}` : ""}`;
                return (
                  <button
                    key={`${row},${col}`}
                    type="button"
                    role="gridcell"
                    aria-label={label}
                    onClick={() => tapSquare(row, col)}
                    className={`words-cell relative grid place-items-center rounded-[2px] ${letter ? "" : premium ? PREMIUM_STYLE[premium] : "bg-[#e9e3cf]"} ${row === CENTER && col === CENTER && !letter ? "!bg-[#e7a29a]" : ""}`}
                  >
                    {letter ? (
                      <span
                        className={`words-tile absolute inset-[1px] grid place-items-center rounded-[3px] font-bold ${mine ? "bg-[#fff1b8] ring-2 ring-green-500" : lastCells.has(`${row},${col}`) ? "bg-[#fbe7a8]" : "bg-[#f6e3b4]"} text-[#2b2118] shadow-[0_1px_0_#b89a5c]`}
                      >
                        {letter}
                        {!blank && <sub className="words-value absolute right-[8%] bottom-[4%] font-semibold">{LETTER_VALUES[letter]}</sub>}
                      </span>
                    ) : row === CENTER && col === CENTER ? (
                      <span aria-hidden="true" className="words-premium">★</span>
                    ) : premium ? (
                      <span aria-hidden="true" className="words-premium font-semibold">
                        {PREMIUM_SHORT[premium]}
                      </span>
                    ) : null}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <aside className="words-aside flex w-full flex-col gap-2 sm:w-[13rem] sm:shrink-0 short:w-[16.5rem] short:gap-1">
        <div className="grid grid-cols-2 gap-1.5" aria-label="Scores">
          {[
            [me, "You"],
            [partner, partnerName],
          ].map(([id, name]) => (
            <div key={id} className={`flex items-baseline justify-between gap-1 rounded-[var(--radius-sm)] px-2 py-1 short:py-0.5 ${view.current === id && active ? "bg-green-700/50 ring-1 ring-green-500" : "bg-black-800"}`}>
              <span className="block truncate text-micro tracking-normal text-text-muted">{name}</span>
              <span className="text-body font-semibold text-white-soft short:text-caption">{score(id)}</span>
            </div>
          ))}
        </div>
        <p className="text-micro tracking-normal text-text-muted">
          Bag {view.bagCount} · {partnerName} has {view.partnerTiles} tiles
        </p>
        <p role="status" aria-live="polite" className={`text-caption font-semibold ${myTurn ? "text-green-500" : "text-text-secondary"}`}>
          {statusLine ?? "Game over"}
        </p>
        {preview && (
          <p className={`text-micro tracking-normal ${preview.error ? "text-pink-400" : "text-white-soft"}`}>
            {preview.error ? preview.error : `${preview.words.map((w) => w.word).join(", ")} · ${preview.score} pts${preview.bingo ? " (bingo!)" : ""}`}
          </p>
        )}
        <LastMove move={view.lastMove} me={me} partnerName={partnerName} />

        {/* Rack */}
        <div role="group" aria-label="Your tiles" className="flex flex-wrap justify-center gap-1 short:flex-nowrap">
          {rack.map((tile) => {
            const used = usedIds.has(tile.id);
            const picked = selected === tile.id || swapIds.includes(tile.id);
            return (
              <button
                key={tile.id}
                type="button"
                aria-label={`${tile.letter === "?" ? "Blank" : tile.letter}, ${tile.letter === "?" ? 0 : LETTER_VALUES[tile.letter]} points${used ? ", on the board" : ""}`}
                aria-pressed={picked}
                disabled={used || !active}
                onClick={() => tapRack(tile.id)}
                className={`words-rack-tile relative grid place-items-center rounded-[5px] font-bold text-[#2b2118] shadow-[0_2px_0_#b89a5c] transition-transform ${
                  used ? "opacity-25" : picked ? "-translate-y-1.5 bg-[#fff1b8] ring-2 ring-green-500" : "bg-[#f6e3b4]"
                }`}
              >
                {tile.letter === "?" ? "" : tile.letter}
                {tile.letter !== "?" && <sub className="absolute right-[10%] bottom-[6%] text-[0.55em] font-semibold">{LETTER_VALUES[tile.letter]}</sub>}
              </button>
            );
          })}
        </div>

        {active && !swapMode && (
          <div className="grid grid-cols-3 gap-1.5 short:grid-cols-7 short:gap-1">
            <button type="button" disabled={!myTurn || !pending.length || busy || Boolean(preview?.error)} onClick={play} className="col-span-3 min-h-10 short:col-span-7 short:min-h-8 rounded-[var(--radius-sm)] bg-green-600 text-caption font-semibold text-white disabled:opacity-40">
              Play{preview && !preview.error ? ` · ${preview.score}` : ""}
            </button>
            <IconButton label="Recall tiles" onClick={recall} disabled={!pending.length}>
              <RotateCcw aria-hidden="true" size={14} />
            </IconButton>
            <IconButton label="Shuffle tiles" onClick={shuffle}>
              <Shuffle aria-hidden="true" size={14} />
            </IconButton>
            <IconButton label={zoom ? "Zoom out" : "Zoom in"} onClick={() => setZoom((z) => !z)}>
              {zoom ? <ZoomOut aria-hidden="true" size={14} /> : <ZoomIn aria-hidden="true" size={14} />}
            </IconButton>
            <button type="button" disabled={!myTurn || busy || view.bagCount < 7} onClick={() => setSwapMode(true)} className="min-h-9 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-micro tracking-normal text-white-soft disabled:opacity-40">
              Swap
            </button>
            {confirm === "pass" ? (
              <button type="button" onClick={() => act("pass", { turn: view.turn })} className="min-h-9 rounded-[var(--radius-sm)] bg-black-700 text-micro tracking-normal text-white-soft">
                Pass?
              </button>
            ) : (
              <button type="button" disabled={!myTurn || busy} onClick={() => setConfirm("pass")} className="min-h-9 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-micro tracking-normal text-white-soft disabled:opacity-40">
                Pass
              </button>
            )}
            {confirm === "resign" ? (
              <button type="button" onClick={() => act("resign", {})} className="min-h-9 rounded-[var(--radius-sm)] bg-pink-500 text-micro font-semibold tracking-normal text-black-950">
                Resign?
              </button>
            ) : (
              <button type="button" onClick={() => setConfirm("resign")} className="flex min-h-9 items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-micro tracking-normal text-white-soft">
                <Flag aria-hidden="true" size={12} /> Resign
              </button>
            )}
          </div>
        )}
        {active && swapMode && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!swapIds.length || busy}
              onClick={() => act("exchange", { ids: swapIds, turn: view.turn })}
              className="min-h-10 rounded-[var(--radius-sm)] bg-green-600 text-caption font-semibold text-white disabled:opacity-40"
            >
              Swap {swapIds.length || ""}
            </button>
            <button
              type="button"
              onClick={() => {
                setSwapMode(false);
                setSwapIds([]);
              }}
              className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-caption text-white-soft"
            >
              Cancel
            </button>
          </div>
        )}
        {view.partnerRack && <p className="text-micro tracking-normal text-text-muted">{partnerName}&apos;s last tiles: {view.partnerRack.map((t) => (t.letter === "?" ? "blank" : t.letter)).join(" ") || "none"}</p>}
      </aside>

      {blankFor && (
        <div role="dialog" aria-label="Choose a letter for your blank tile" className="fixed inset-0 z-50 grid place-items-center bg-black-950/60 p-3" onClick={() => setBlankFor(null)}>
          <div className="panel flex max-w-sm flex-col items-center gap-2 rounded-[var(--radius-lg)] p-3" onClick={(event) => event.stopPropagation()}>
            <p className="text-caption font-semibold text-white-soft">Blank tile — which letter?</p>
            <div className="grid grid-cols-9 gap-1">
              {LETTERS.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => {
                    setPending((current) => [...current, { id: blankFor.id, row: blankFor.row, col: blankFor.col, blank: true, letter }]);
                    setBlankFor(null);
                    setSelected(null);
                  }}
                  className="grid size-8 place-items-center rounded-[4px] bg-[#f6e3b4] text-caption font-bold text-[#2b2118] hover:ring-2 hover:ring-green-500"
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, disabled = false, children }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid min-h-9 place-items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] text-white-soft disabled:opacity-40">
      {children}
    </button>
  );
}

function LastMove({ move, me, partnerName }) {
  if (!move) return null;
  const who = move.by === me ? "You" : partnerName;
  const text =
    move.type === "place"
      ? `${who} played ${move.words.map((w) => w.word).join(", ")} for ${move.score}${move.bingo ? " — bingo!" : ""}`
      : move.type === "exchange"
        ? `${who} swapped ${move.count} tile${move.count === 1 ? "" : "s"}`
        : `${who} passed`;
  return <p className="text-micro tracking-normal text-text-secondary">{text}</p>;
}
