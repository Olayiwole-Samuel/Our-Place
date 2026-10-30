"use client";

import { Flag, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { SIZE } from "./rules";

/**
 * Battleship. Renders the server's view and sends intents only:
 *   shuffle · ready · fire { cell } · resign
 * Placing: your sea with your fleet (Shuffle for a new layout, Ready to lock it).
 * Battle: their sea (tap to fire) beside your own, smaller. Their ships are
 * never in the view until you sink them. A shot splashes; a hit flashes.
 */
const LETTERS = "ABCDEFGHIJ";
const nameOf = (cell) => `${LETTERS[Math.floor(cell / SIZE)]}${(cell % SIZE) + 1}`;

export default function Battleship({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const active = status === "active" && !view.ended;
  const myTurn = active && view.phase === "firing" && view.current === me;
  const iAmReady = view.ready.includes(me);
  const partnerReady = view.ready.includes(partner);
  const [confirmResign, setConfirmResign] = useState(false);

  const turns = useRef(view.turns);
  useEffect(() => {
    if (view.turns > turns.current) playSound(view.last?.hit ? "capture" : "move");
    turns.current = view.turns;
  }, [view.turns, view.last?.hit]);

  const myShipCells = new Map(view.myFleet.flatMap((ship) => ship.cells.map((c) => [c, ship])));
  const sunkCells = new Map(view.sunkShips.flatMap((ship) => ship.cells.map((c) => [c, ship])));

  const lastLine = view.last
    ? `${view.last.by === me ? "You" : partnerName} fired at ${nameOf(view.last.cell)} — ${view.last.sunk ? `sunk ${view.last.by === me ? "their" : "your"} ${view.last.sunk}! 💥` : view.last.hit ? "hit! 🔥" : "miss 💦"}`
    : null;
  const line =
    view.phase === "placing"
      ? iAmReady
        ? `Fleet ready — waiting for ${partnerName}…`
        : partnerReady
          ? `${partnerName} is ready. Shuffle your fleet if you like, then tap Ready.`
          : "Here's your fleet. Shuffle it if you like, then tap Ready."
      : !active
        ? null
        : myTurn
          ? "Your shot — tap their sea"
          : `${partnerName} is aiming…`;

  const sea = ({ label, big, cellView, onFire }) => (
    <div className="flex flex-col items-center gap-1">
      <p className="micro-caps text-text-muted">{label}</p>
      <div
        role="grid"
        aria-label={label}
        className={`grid grid-cols-10 gap-px overflow-hidden rounded-[var(--radius-sm)] bg-[#0b2a4a] p-px ${big ? "w-[clamp(12rem,min(52vmin,60vw),22rem)]" : "w-[clamp(8rem,min(34vmin,40vw),15rem)]"}`}
      >
        {Array.from({ length: SIZE * SIZE }, (_, cell) => {
          const { look, text, can } = cellView(cell);
          return (
            <button
              key={cell}
              type="button"
              role="gridcell"
              aria-label={`${nameOf(cell)}: ${text}`}
              aria-disabled={!can}
              onClick={() => can && onFire?.(cell)}
              className={`relative grid aspect-square place-items-center text-[clamp(0.45rem,1.6vmin,0.8rem)] ${look} ${can ? "cursor-crosshair hover:brightness-150" : "cursor-default"}`}
            >
              {view.last?.cell === cell && ((onFire && view.last.by === me) || (!onFire && view.last.by === partner)) && (
                <span key={view.turns} aria-hidden="true" className={`${view.last.hit ? "bs-hit" : "bs-splash"} pointer-events-none absolute inset-0 rounded-full`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Your own sea: your ships, and where your partner has fired.
  const mine = (cell) => {
    const ship = myShipCells.get(cell);
    const shot = view.theirShots[cell];
    if (shot === "hit") return { look: ship && view.myFleet.find((s) => s.id === ship.id)?.sunk ? "bg-[#5a1a1a] after:content-['✕'] after:text-red-300" : "bg-[#a33a2a] after:content-['✕'] after:text-white", text: "hit", can: false };
    if (ship) return { look: "bg-[#8a96a3]", text: ship.name, can: false };
    if (shot === "miss") return { look: "bg-[#0f3a63] after:content-['•'] after:text-white/60", text: "miss", can: false };
    return { look: "bg-[#14497c]", text: "water", can: false };
  };
  // Their sea: your shots, and the ships you've sunk.
  const theirs = (cell) => {
    const shot = view.myShots[cell];
    const sunk = sunkCells.get(cell);
    if (sunk) return { look: sunk.sunk ? "bg-[#5a1a1a] after:content-['✕'] after:text-red-300" : "bg-[#55606b]", text: `${sunk.name}${sunk.sunk ? ", sunk" : ""}`, can: false };
    if (shot === "hit") return { look: "bg-[#c2452f] after:content-['✕'] after:text-white", text: "hit", can: false };
    if (shot === "miss") return { look: "bg-[#0f3a63] after:content-['•'] after:text-white/60", text: "miss", can: false };
    return { look: "bg-[#14497c]", text: "not fired at", can: myTurn && !busy };
  };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p role="status" aria-live="polite" className={`text-center text-caption ${myTurn ? "font-semibold text-green-500" : "text-text-secondary"}`}>
        {line ?? (view.ended ? "The battle is over" : "")}
      </p>

      {view.phase === "placing" ? (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-4">
          {sea({ label: "Your fleet", big: true, cellView: mine })}
          {active && !iAmReady && (
            <div className="flex gap-2 sm:flex-col">
              <button type="button" disabled={busy} onClick={() => act("shuffle", {})} className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 text-caption text-text-secondary hover:bg-black-700">
                <Shuffle aria-hidden="true" size={15} /> Shuffle
              </button>
              <button type="button" disabled={busy} onClick={() => act("ready", {})} className="min-h-11 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white transition-transform active:scale-[0.98]">
                Ready ⚓
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
          {sea({ label: `${partnerName}'s sea · ${view.afloat.theirs} afloat`, big: true, cellView: theirs, onFire: (cell) => act("fire", { cell }) })}
          <div className="flex flex-col items-center gap-2">
            {sea({ label: `Your sea · ${view.afloat.mine} afloat`, big: false, cellView: mine })}
            {lastLine && <p className="max-w-60 text-center text-micro tracking-normal text-text-secondary">{lastLine}</p>}
            {active &&
              (confirmResign ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => act("resign", {})} className="min-h-9 rounded-[var(--radius-md)] bg-pink-500 px-3 text-micro font-semibold tracking-normal text-black-950">
                    Yes, surrender
                  </button>
                  <button type="button" onClick={() => setConfirmResign(false)} className="min-h-9 px-2 text-micro tracking-normal text-text-muted">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmResign(true)} className="flex min-h-9 items-center gap-1.5 text-micro tracking-normal text-text-muted hover:text-text-secondary">
                  <Flag aria-hidden="true" size={13} /> Surrender
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
