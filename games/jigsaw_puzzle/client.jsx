"use client";

import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCouplePhotos } from "@/lib/couple/photos";
import { playSound } from "@/lib/ui/sounds";
import { BUILTIN_IMAGES, PHOTO_IMAGES } from "./images";
import { DIFFICULTIES, pieceSides, piecePath, tableBounds } from "./shapes";

/**
 * Jigsaw Puzzle (co-op). Renders the server's shared puzzle and sends intents:
 *   act("configure", { image?, difficulty? }) · act("start", {}) · act("restart", {})
 *   act("grab", { piece }) · act("drop", { piece, x, y }) · act("release", { piece })
 * Pieces are cut and scattered by the server, which also decides every snap.
 * While dragging, a cosmetic hint (≤ 10/s) shows the partner where the piece
 * is (`hints`, the couple's presence channel); only drops change the puzzle.
 *
 * Drawn as one SVG in piece units: every piece clips the picture with its own
 * jigsaw outline, so pieces are real jigsaw shapes at any size.
 */
const HINT_MS = 100;

export default function Jigsaw({ view, partner, names = {}, status, busy, act, hints }) {
  const partnerName = names[partner] ?? "Your partner";
  const photos = useCouplePhotos();
  const imageSrc = useImageSrc(view.image, photos);
  if (view.phase === "choose") return <Choose view={view} busy={busy} act={act} photos={photos} partnerName={partnerName} />;
  return <Table view={view} act={act} hints={hints} imageSrc={imageSrc} partnerName={partnerName} active={status === "active" && view.phase === "playing"} />;
}

function useImageSrc(image, photos) {
  const builtin = BUILTIN_IMAGES.find((entry) => entry.id === image);
  if (builtin) return builtin.src;
  const photo = PHOTO_IMAGES.find((entry) => entry.id === image);
  return (photo && photos?.[photo.slot]) || BUILTIN_IMAGES[0].src;
}

function Choose({ view, busy, act, photos, partnerName }) {
  const options = [...BUILTIN_IMAGES, ...PHOTO_IMAGES.filter((photo) => photos?.[photo.slot]).map((photo) => ({ ...photo, src: photos[photo.slot] }))];
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 short:gap-2">
      <div className="text-center">
        <p className="text-subheading font-semibold text-white-soft short:text-body">Pick a picture</p>
        <p className="text-caption text-text-secondary short:hidden">You and {partnerName} build it together — either of you can choose.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 short:grid-cols-6 short:gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={busy}
            aria-pressed={view.image === option.id}
            onClick={() => act("configure", { image: option.id })}
            className={`overflow-hidden rounded-[var(--radius-sm)] text-left ${view.image === option.id ? "ring-2 ring-green-500" : "ring-1 ring-[var(--border-subtle)]"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local SVGs and short-lived signed photo URLs */}
            <img src={option.src} alt="" className="aspect-[4/3] w-full object-cover short:aspect-[2/1]" />
            <span className="block truncate px-1.5 py-1 text-micro tracking-normal text-white-soft">{option.name}</span>
          </button>
        ))}
      </div>
      {!PHOTO_IMAGES.some((photo) => photos?.[photo.slot]) && <p className="text-center text-micro tracking-normal text-text-muted short:hidden">Add your “together” photos in Ludo → Customise board to puzzle them too.</p>}
      <div className="grid grid-cols-3 gap-2 short:grid-cols-4">
        {Object.entries(DIFFICULTIES).map(([id, difficulty]) => (
          <button
            key={id}
            type="button"
            disabled={busy}
            aria-pressed={view.difficulty === id}
            onClick={() => act("configure", { difficulty: id })}
            className={`min-h-10 rounded-[var(--radius-sm)] px-2 text-caption ${view.difficulty === id ? "bg-green-700/60 font-semibold text-white-soft ring-1 ring-green-500" : "bg-black-800 text-text-secondary"}`}
          >
            {difficulty.label}{id === "hard" ? <span className="block text-micro tracking-normal text-text-muted short:hidden">Best on a bigger screen</span> : null}
          </button>
        ))}
        <button type="button" disabled={busy} onClick={() => act("start", {})} className="col-span-3 min-h-11 rounded-[var(--radius-md)] bg-green-600 text-body font-semibold text-white short:col-span-1 short:min-h-10 short:text-caption">
          Start
        </button>
      </div>
    </div>
  );
}

function Table({ view, act, hints, imageSrc, partnerName, active }) {
  const prefix = useId().replace(/:/g, "");
  const svgRef = useRef(null);
  const [guide, setGuide] = useState(true);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [drag, setDrag] = useState(null); // { piece, group, members, dx, dy, startX, startY, x, y }
  const [settling, setSettling] = useState(null); // our dropped group's position until the server answers
  const [partnerDrag, setPartnerDrag] = useState(null); // { piece, x, y, at }
  const [nudge, setNudge] = useState(null);
  const grabbing = useRef(null);
  const lastHint = useRef(0);
  const reduced = useReducedMotion();
  const { grid, pieces, edges } = view;
  const bounds = tableBounds(grid);
  const viewBox = `${bounds.minX - 0.4} ${bounds.minY - 0.4} ${bounds.maxX - bounds.minX + 1.8} ${bounds.maxY - bounds.minY + 1.8}`;

  const paths = useMemo(() => pieces.map((piece) => piecePath(pieceSides(edges, grid, piece.col, piece.row))), [pieces, edges, grid]);
  const membersOf = (group) => pieces.map((p, i) => (p.group === group ? i : -1)).filter((i) => i >= 0);

  useEffect(() => {
    if (!nudge) return undefined;
    const timer = setTimeout(() => setNudge(null), 3000);
    return () => clearTimeout(timer);
  }, [nudge]);

  // The server's answer replaces our local idea of where things are.
  useEffect(() => {
    setSettling(null);
  }, [view.moves]);

  // Snap / join feedback (a soft click) for either player's successful drop.
  const lastMoves = useRef(view.moves);
  useEffect(() => {
    if (view.moves > lastMoves.current && (view.lastDrop?.joined || view.lastDrop?.placed)) playSound("snap");
    lastMoves.current = view.moves;
  }, [view.moves, view.lastDrop]);

  // Partner's live drag (cosmetic).
  useEffect(() => {
    if (!hints) return undefined;
    const off = hints.subscribe((hint) => {
      if (hint?.g !== "jig" || !Number.isInteger(hint.piece) || !Number.isFinite(hint.x) || !Number.isFinite(hint.y)) return;
      setPartnerDrag(hint.end ? null : { piece: hint.piece, x: hint.x, y: hint.y, at: Date.now() });
    });
    const timer = setInterval(() => setPartnerDrag((current) => (current && Date.now() - current.at > 1500 ? null : current)), 500);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [hints]);
  useEffect(() => setPartnerDrag(null), [view.moves]);

  const toSvg = (event) => {
    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };

  const onPointerDown = (event, index) => {
    if (!active || event.button > 0) return;
    const piece = pieces[index];
    if (piece.placed) return;
    if (view.holds[piece.group] === "partner") {
      setNudge(`${partnerName} is moving that piece.`);
      return;
    }
    event.preventDefault();
    const point = toSvg(event);
    svgRef.current.setPointerCapture?.(event.pointerId);
    const members = membersOf(piece.group);
    setNudge(null);
    setDrag({ id: event.pointerId, piece: index, group: piece.group, members, dx: point.x - piece.x, dy: point.y - piece.y, x: piece.x, y: piece.y });
    grabbing.current = act("grab", { piece: index });
  };

  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const point = toSvg(event);
    const x = point.x - drag.dx;
    const y = point.y - drag.dy;
    setDrag((current) => current && { ...current, x, y });
    const now = performance.now();
    if (hints && now - lastHint.current > HINT_MS) {
      lastHint.current = now;
      hints.send({ g: "jig", piece: drag.piece, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    }
  };

  const onPointerUp = async (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { piece, x, y, members } = drag;
    const base = pieces[piece];
    setDrag(null);
    hints?.send({ g: "jig", piece, x, y, end: true });
    if (Math.hypot(x - base.x, y - base.y) < 0.02) {
      act("release", { piece });
      return;
    }
    setSettling({ members, dx: x - base.x, dy: y - base.y });
    await grabbing.current; // the grab must land first (actions are one at a time)
    const result = await act("drop", { piece, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    if (!result) setSettling(null);
  };

  // Where to draw each piece: dragging > settling > partner's live drag > server.
  const offsetFor = (index) => {
    if (drag?.members.includes(index)) return [drag.x - pieces[drag.piece].x, drag.y - pieces[drag.piece].y];
    if (settling?.members.includes(index)) return [settling.dx, settling.dy];
    if (partnerDrag && pieces[partnerDrag.piece]?.group === pieces[index].group && !pieces[index].placed) return [partnerDrag.x - pieces[partnerDrag.piece].x, partnerDrag.y - pieces[partnerDrag.piece].y];
    return [0, 0];
  };

  // Placed pieces first, the dragged group last (on top).
  const order = useMemo(() => {
    const indexes = pieces.map((_, i) => i);
    const rank = (i) => (pieces[i].placed ? 0 : drag?.members.includes(i) ? 3 : partnerDrag && pieces[partnerDrag.piece]?.group === pieces[i].group ? 2 : 1);
    return indexes.sort((a, b) => rank(a) - rank(b));
  }, [pieces, drag, partnerDrag]);

  const { placed, total } = view.progress;
  return (
    <div className="jigsaw flex w-full flex-col gap-2 short:gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black-800">
            <div className="h-full rounded-full bg-green-500 transition-[width] duration-300" style={{ width: `${(placed / Math.max(1, total)) * 100}%` }} />
          </div>
          <span className="shrink-0 text-micro tracking-normal text-text-secondary">
            {placed}/{total} in place
          </span>
        </div>
        <button type="button" aria-pressed={guide} onClick={() => setGuide((g) => !g)} className="flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-2 text-micro tracking-normal text-white-soft">
          {guide ? <EyeOff aria-hidden="true" size={13} /> : <Eye aria-hidden="true" size={13} />} Guide
        </button>
        {active &&
          (confirmRestart ? (
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => act("restart", {})} className="min-h-8 rounded-[var(--radius-sm)] bg-pink-500 px-2 text-micro font-semibold tracking-normal text-black-950">
                Erase progress?
              </button>
              <button type="button" onClick={() => setConfirmRestart(false)} className="min-h-8 px-1.5 text-micro tracking-normal text-text-secondary">
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmRestart(true)} className="flex min-h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-2 text-micro tracking-normal text-white-soft">
              <RotateCcw aria-hidden="true" size={13} /> New puzzle
            </button>
          ))}
      </div>
      {nudge && (
        <p role="alert" className="text-micro tracking-normal text-pink-400">
          {nudge}
        </p>
      )}

      <svg
        ref={svgRef}
        viewBox={viewBox}
        role="application"
        aria-label={`Jigsaw table: ${placed} of ${total} pieces in place. Drag pieces into the frame.`}
        className="jigsaw-table w-full touch-none select-none rounded-[var(--radius-md)] bg-[#1b241d]"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {pieces.map((_, index) => (
            <clipPath key={index} id={`${prefix}-clip-${index}`} clipPathUnits="userSpaceOnUse">
              <path d={paths[index]} />
            </clipPath>
          ))}
        </defs>
        {/* The frame, with an optional faint guide picture */}
        <rect x={0} y={0} width={grid.cols} height={grid.rows} fill="#0f1511" stroke="#7d8f69" strokeWidth={0.03} rx={0.04} />
        {guide && <image href={imageSrc} x={0} y={0} width={grid.cols} height={grid.rows} preserveAspectRatio="xMidYMid slice" opacity={0.18} />}

        {order.map((index) => {
          const piece = pieces[index];
          const [ox, oy] = offsetFor(index);
          const heldByPartner = view.holds[piece.group] === "partner" || (partnerDrag && pieces[partnerDrag.piece]?.group === piece.group);
          const dragging = drag?.members.includes(index);
          const partnerMoving = partnerDrag && pieces[partnerDrag.piece]?.group === piece.group;
          // Your own drag follows your finger exactly; everything else glides: your
          // partner's live drag (updates ~10×/s) and the server's snap into place.
          const transition = dragging || reduced ? "none" : partnerMoving ? "transform 0.12s linear" : "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)";
          return (
            <g
              key={index}
              onPointerDown={(event) => onPointerDown(event, index)}
              className={piece.placed ? "" : heldByPartner ? "cursor-not-allowed" : "cursor-grab"}
              style={{ transform: `translate(${piece.x + ox}px, ${piece.y + oy}px)`, transition, ...(dragging ? { filter: "drop-shadow(0 0.08px 0.12px rgba(0,0,0,0.6))" } : {}) }}
            >
              <image href={imageSrc} x={-piece.col} y={-piece.row} width={grid.cols} height={grid.rows} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${prefix}-clip-${index})`} />
              <path d={paths[index]} fill="none" stroke={heldByPartner ? "#f3a6b9" : piece.placed ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.55)"} strokeWidth={heldByPartner ? 0.05 : 0.02} />
            </g>
          );
        })}
      </svg>
      <p className="text-center text-micro tracking-normal text-text-muted short:hidden">Drag pieces into the frame — they click into place when close. Pieces that belong together join up.</p>
    </div>
  );
}
