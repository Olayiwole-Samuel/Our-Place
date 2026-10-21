"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { SHAPES, SHAPE_LABEL, cardPoints, parseCard } from "./cards";

/**
 * Naija Whot table. Renders the server's view and sends intents only:
 *   act("settings", { key, value }) · act("deal", {})          before the deal
 *   act("play", { cardId, shape?, turn }) · act("market", { turn })
 * Playable cards come from the server (view.playable), so the hand only offers
 * what the server will accept — and the server checks every play again.
 *
 * Your hand is private (the server only ever sends you yours); your partner's
 * is shown as card backs with a count.
 */
const MAROON = "#7a1f3d";
const CREAM = "#fbf3e2";

export default function NaijaWhot({ view, me, partner, names = {}, status, busy, act }) {
  const reduced = useReducedMotion();
  const partnerName = names[partner] ?? "Your partner";
  const active = status === "active" && view.phase === "playing";
  const myTurn = active && view.current === me;
  const [whotCard, setWhotCard] = useState(null); // a Whot waiting for its shape
  const [nudge, setNudge] = useState(null);
  const playable = new Set(view.playable);

  // Sounds: a card hitting the pile, a pick.
  const lastTurn = useRef(view.turn);
  useEffect(() => {
    if (view.turn > lastTurn.current && view.last?.by !== me) playSound(view.last?.type === "play" ? "card" : "move");
    lastTurn.current = view.turn;
  }, [view.turn, view.last, me]);

  useEffect(() => {
    setWhotCard(null);
    setNudge(null);
  }, [view.turn]);
  useEffect(() => {
    if (!nudge) return undefined;
    const timer = setTimeout(() => setNudge(null), 3000);
    return () => clearTimeout(timer);
  }, [nudge]);

  if (view.phase === "settings") return <Settings view={view} busy={busy} act={act} partnerName={partnerName} me={me} />;

  const playCard = (cardId) => {
    if (!myTurn || busy) return;
    if (!playable.has(cardId)) {
      setNudge(
        view.pending
          ? view.pending.number === 2
            ? "Only a 2 can block a Pick Two."
            : "Only a 5 can block a Pick Three."
          : view.requestedShape
            ? `Play a ${SHAPE_LABEL[view.requestedShape].toLowerCase()} or a Whot.`
            : "Match the shape or the number.",
      );
      return;
    }
    if (parseCard(cardId).shape === "whot") {
      setWhotCard(cardId);
      return;
    }
    playSound("card");
    act("play", { cardId, turn: view.turn });
  };
  const goMarket = () => {
    if (!myTurn || busy) return;
    playSound("move");
    act("market", { turn: view.turn });
  };

  const prompt = !active
    ? null
    : myTurn
      ? view.pending
        ? `Pick ${view.pending.count} — or block with a ${view.pending.number}`
        : view.requestedShape
          ? `${partnerName} wants ${SHAPE_LABEL[view.requestedShape]} — play one, a Whot, or go to market`
          : view.playable.length
            ? "Your turn — play a card or go to market"
            : "No match — go to market"
      : `${partnerName}'s turn…`;

  return (
    <div className="whot flex w-full flex-col items-center gap-[clamp(8px,1.8vmin,14px)]">
      <div className="whot-table flex flex-col items-center gap-[clamp(6px,1.6vmin,12px)]">
        {/* Partner: card backs + count */}
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-caption text-text-secondary">
            <span className="font-semibold text-pink-400">{partnerName}</span> · {view.partnerCount} {view.partnerCount === 1 ? "card — last card!" : "cards"}
          </span>
          {view.current === partner && active && <span className="rounded-full bg-pink-500/20 px-2 py-0.5 text-micro tracking-normal text-pink-400">Playing</span>}
        </div>
        <div aria-hidden="true" className="flex h-[var(--whot-back-h)] items-center">
          <AnimatePresence initial={false}>
            {(view.partnerHand ?? Array.from({ length: Math.min(view.partnerCount, 14) })).map((cardId, index) => (
              <m.div
                key={cardId ?? index}
                initial={reduced ? false : { y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduced ? undefined : { y: 30, opacity: 0, transition: { duration: 0.2 } }}
                className="-ml-[calc(var(--whot-back-w)*0.62)] first:ml-0"
              >
                {cardId ? <CardFace id={cardId} size="back" /> : <CardBack size="back" />}
              </m.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Table: market and call card */}
        <div className="flex items-center justify-center gap-[clamp(16px,5vw,40px)]">
          <button
            type="button"
            onClick={goMarket}
            disabled={!myTurn || busy}
            aria-label={`Market, ${view.marketCount} cards${myTurn ? (view.pending ? `. Pick ${view.pending.count}` : ". Draw one") : ""}`}
            className={`group relative flex flex-col items-center gap-1 rounded-[var(--radius-md)] ${myTurn ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className="relative">
              <span className="absolute top-1 left-1">
                <CardBack size="table" />
              </span>
              <span className={`relative block transition-transform ${myTurn ? "group-hover:-translate-y-1" : ""}`}>
                <CardBack size="table" glow={myTurn && (!view.playable.length || view.pending)} />
              </span>
            </div>
            <span className="text-micro tracking-normal text-text-secondary">
              Market · {view.marketCount}
              {view.reshuffles ? ` · reshuffled ${view.reshuffles}×` : ""}
            </span>
            {myTurn && <span className="text-micro font-semibold tracking-normal text-green-500">{view.pending ? `Pick ${view.pending.count}` : "Go to market"}</span>}
          </button>

          <div className="relative flex flex-col items-center gap-1">
            <AnimatePresence mode="popLayout" initial={false}>
              {view.top && (
                <m.div
                  key={view.top}
                  // The card flies in from whoever played it: your hand below, your partner's above.
                  initial={reduced ? false : view.last?.by === me ? { y: 70, rotate: 10, scale: 0.9, opacity: 0 } : { y: -70, rotate: -10, scale: 0.9, opacity: 0 }}
                  animate={{ y: 0, rotate: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 360, damping: 26 }}
                >
                  <CardFace id={view.top} size="table" />
                </m.div>
              )}
            </AnimatePresence>
            {view.pending && active && (
              <span role="status" className="whot-pending absolute -top-2 -right-3 z-10 rounded-full bg-pink-500 px-2 py-0.5 text-micro font-bold tracking-normal text-black-950">
                Pick {view.pending.count}
              </span>
            )}
            <span className="text-micro tracking-normal text-text-secondary">
              {view.requestedShape ? (
                <>
                  Wants <span className="font-semibold text-white-soft">{SHAPE_LABEL[view.requestedShape]}</span>{" "}
                  <ShapeIcon shape={view.requestedShape} className="inline size-3.5 align-[-2px]" color="currentColor" />
                </>
              ) : (
                "Call card"
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="whot-player flex w-full flex-col items-center gap-[clamp(6px,1.6vmin,12px)]">
        {/* What just happened */}
        <p role="status" aria-live="polite" className="min-h-5 text-center text-caption text-text-secondary">
          <LastMove last={view.last} me={me} partnerName={partnerName} />
        </p>

        <p className={`text-center text-caption font-semibold ${myTurn ? "text-green-500" : "text-text-secondary"}`}>{prompt ?? "Game over"}</p>
        {nudge && (
          <p role="alert" className="-mt-2 text-center text-micro tracking-normal text-pink-400">
            {nudge}
          </p>
        )}

        {/* Your hand */}
        <div role="group" aria-label={`Your hand, ${view.hand.length} cards`} className="whot-hand flex w-full justify-center overflow-x-auto overscroll-contain px-2 pt-3 pb-1">
          <div className="flex">
            <AnimatePresence initial={false}>
              {view.hand.map((cardId, index) => {
                const can = playable.has(cardId);
                const card = parseCard(cardId);
                return (
                  <m.button
                    key={cardId}
                    layout={!reduced}
                    type="button"
                    initial={reduced ? false : { y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={reduced ? undefined : { y: -50, opacity: 0, transition: { duration: 0.18 } }}
                    onClick={() => playCard(cardId)}
                    aria-label={`${card.shape === "whot" ? "Whot 20" : `${SHAPE_LABEL[card.shape]} ${card.number}`}${can ? ", playable" : ""}`}
                    className={`relative shrink-0 rounded-[10%] transition-transform ${index ? "-ml-[calc(var(--whot-hand-w)*0.22)]" : ""} ${
                      myTurn && can ? "-translate-y-2 hover:-translate-y-4 focus-visible:-translate-y-4" : "hover:-translate-y-1"
                    } ${myTurn && !can ? "opacity-55" : ""}`}
                    style={{ zIndex: index }}
                  >
                    <CardFace id={cardId} size="hand" highlight={myTurn && can} />
                  </m.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
        <p className="text-micro tracking-normal text-text-muted">
          {view.hand.length === 1 ? "Last card! Play it to check up." : `${view.hand.length} cards`}
          {" · "}
          {settingsLine(view.settings)}
        </p>
      </div>

      {whotCard && (
        <div role="dialog" aria-label="Name a shape" className="fixed inset-0 z-50 grid place-items-center bg-black-950/60 p-4" onClick={() => setWhotCard(null)}>
          <div className="panel flex flex-col items-center gap-3 rounded-[var(--radius-lg)] p-4" onClick={(event) => event.stopPropagation()}>
            <p className="text-body font-semibold text-white-soft">Whot! What shape do you want?</p>
            <div className="grid grid-cols-5 gap-2">
              {SHAPES.map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => {
                    playSound("card");
                    act("play", { cardId: whotCard, shape, turn: view.turn });
                    setWhotCard(null);
                  }}
                  className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] bg-[#fbf3e2] text-[0.6rem] font-semibold text-[#7a1f3d] hover:ring-2 hover:ring-green-500"
                >
                  <ShapeIcon shape={shape} className="size-7" color={MAROON} />
                  {SHAPE_LABEL[shape]}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setWhotCard(null)} className="text-caption text-text-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const settingsLine = (s) =>
  [
    s.pickTwo ? "Pick 2 on" : "Pick 2 off",
    s.pickThree ? "Pick 3 on" : "Pick 3 off",
    s.suspension ? "Suspension on" : "Suspension off",
    s.tender === "count" ? "Tender: count" : "Tender: reshuffle",
  ].join(" · ");

function LastMove({ last, me, partnerName }) {
  if (!last || last.type === "deal") return "Cards dealt — 6 each.";
  const who = last.by === me ? "You" : partnerName;
  if (last.type === "market") return `${who} went to market.`;
  if (last.type === "pick") return `${who} picked ${last.count}.`;
  const card = parseCard(last.cardId);
  const name = card.shape === "whot" ? "Whot" : `${SHAPE_LABEL[card.shape]} ${card.number}`;
  if (last.checkUp) return `${who} played ${name} — check up!`;
  switch (last.effect) {
    case "hold_on":
      return `${who} played ${name}: Hold on — ${who === "You" ? "play again" : "they play again"}.`;
    case "suspension":
      return `${who} played ${name}: Suspension — ${who === "You" ? `${partnerName} misses a turn` : "you miss a turn"}.`;
    case "general_market":
      return `${who} played ${name}: General market — ${who === "You" ? `${partnerName} picked 1` : "you picked 1"}.`;
    case "pick_two":
    case "pick_three":
      return `${who} ${last.blocked ? "blocked with" : "played"} ${name}: pick ${last.pending}!`;
    case "whot":
      return `${who} played Whot and asked for ${SHAPE_LABEL[last.shape]}.`;
    default:
      return `${who} played ${name}.`;
  }
}

function Settings({ view, busy, act, partnerName, me }) {
  const s = view.settings;
  const toggle = (key) => act("settings", { key, value: !s[key] });
  const row = (key, title, detail) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-black-800/70 px-3 py-2.5">
      <span>
        <span className="block text-caption font-semibold text-white-soft">{title}</span>
        <span className="block text-micro tracking-normal text-text-muted">{detail}</span>
      </span>
      <input type="checkbox" role="switch" checked={s[key]} disabled={busy} onChange={() => toggle(key)} className="size-5 accent-green-600" />
    </label>
  );
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-2.5">
      <div className="text-center">
        <p className="text-subheading font-semibold text-white-soft">House rules</p>
        <p className="text-caption text-text-secondary">Either of you can change these before the deal. {view.first === me ? "You start." : `${partnerName} starts.`}</p>
      </div>
      {row("pickTwo", "Pick Two (2)", "Next player picks 2 — only a 2 blocks it, and blocks stack.")}
      {row("pickThree", "Pick Three (5)", "Next player picks 3 — only a 5 blocks it, and blocks stack.")}
      {row("suspension", "Suspension (8)", "Next player misses a turn.")}
      <fieldset className="rounded-[var(--radius-sm)] bg-black-800/70 px-3 py-2.5">
        <legend className="sr-only">Tender</legend>
        <span className="block text-caption font-semibold text-white-soft">Tender — when the market finishes</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {[
            ["count", "Count cards", "Lowest total wins · stars ×2"],
            ["reshuffle", "Reshuffle", "Old cards become the market"],
          ].map(([value, title, detail]) => (
            <button
              key={value}
              type="button"
              aria-pressed={s.tender === value}
              disabled={busy}
              onClick={() => act("settings", { key: "tender", value })}
              className={`rounded-[var(--radius-sm)] px-2 py-2 text-left ${s.tender === value ? "bg-green-700/60 ring-1 ring-green-500" : "bg-black-950/60"}`}
            >
              <span className="block text-caption font-semibold text-white-soft">{title}</span>
              <span className="block text-micro tracking-normal text-text-muted">{detail}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-center text-micro tracking-normal text-text-muted">Hold on (1), General market (14) and Whot (20) are always on. Playing your last card is check up.</p>
      <button type="button" disabled={busy} onClick={() => act("deal", {})} className="min-h-11 rounded-[var(--radius-md)] bg-green-600 text-body font-semibold text-white">
        Deal 6 each
      </button>
    </div>
  );
}

// ── Card art ────────────────────────────────────────────────────────────────

export function ShapeIcon({ shape, className = "", color = MAROON }) {
  const common = { fill: color };
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      {shape === "circle" && <circle cx="50" cy="50" r="40" {...common} />}
      {shape === "triangle" && <polygon points="50,10 92,88 8,88" {...common} />}
      {shape === "cross" && <path d="M38 8h24v30h30v24H62v30H38V62H8V38h30z" {...common} />}
      {shape === "square" && <rect x="12" y="12" width="76" height="76" {...common} />}
      {shape === "star" && <polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38" {...common} />}
      {shape === "whot" && (
        <text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="800" fill={color} fontFamily="Georgia, serif">
          W
        </text>
      )}
    </svg>
  );
}

const SIZE_CLASS = {
  hand: "whot-card-hand",
  table: "whot-card-table",
  back: "whot-card-back",
};

export function CardFace({ id, size = "hand", highlight = false }) {
  const card = parseCard(id);
  if (!card) return null;
  const isWhot = card.shape === "whot";
  return (
    <div
      className={`${SIZE_CLASS[size]} relative overflow-hidden rounded-[10%] border shadow-[0_4px_12px_rgba(0,0,0,0.4)] ${highlight ? "border-green-500 ring-2 ring-green-500/70" : "border-[#d9c9a8]"}`}
      style={{ background: CREAM }}
    >
      <svg viewBox="0 0 70 100" className="size-full" aria-hidden="true">
        <text x="7" y="16" fontSize="13" fontWeight="800" fill={MAROON} fontFamily="Georgia, serif">
          {card.number}
        </text>
        {/* A small shape under the corner number, so overlapped cards still show their shape. */}
        {!isWhot && (
          <g transform="translate(7 20) scale(0.1)">
            <ShapeGlyph shape={card.shape} />
          </g>
        )}
        <text x="63" y="94" fontSize="13" fontWeight="800" fill={MAROON} fontFamily="Georgia, serif" textAnchor="end">
          {card.number}
        </text>
        {isWhot ? (
          <>
            <rect x="11" y="24" width="48" height="52" rx="6" fill={MAROON} />
            <text x="35" y="56" textAnchor="middle" fontSize="15" fontWeight="900" fill={CREAM} fontFamily="Georgia, serif" letterSpacing="1">
              WHOT
            </text>
          </>
        ) : (
          <g transform="translate(15 30) scale(0.4)">
            <ShapeGlyph shape={card.shape} />
          </g>
        )}
        {card.shape === "star" && (
          <text x="35" y="57" textAnchor="middle" fontSize="9" fontWeight="800" fill={CREAM} fontFamily="Georgia, serif">
            {card.number}
          </text>
        )}
      </svg>
      <span className="sr-only">{cardPoints(id)} points</span>
    </div>
  );
}

function ShapeGlyph({ shape }) {
  switch (shape) {
    case "circle":
      return <circle cx="50" cy="50" r="40" fill={MAROON} />;
    case "triangle":
      return <polygon points="50,10 92,88 8,88" fill={MAROON} />;
    case "cross":
      return <path d="M38 8h24v30h30v24H62v30H38V62H8V38h30z" fill={MAROON} />;
    case "square":
      return <rect x="12" y="12" width="76" height="76" fill={MAROON} />;
    default:
      return <polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38" fill={MAROON} />;
  }
}

export function CardBack({ size = "hand", glow = false }) {
  return (
    <div
      className={`${SIZE_CLASS[size]} relative overflow-hidden rounded-[10%] border border-[#4d1327] shadow-[0_4px_12px_rgba(0,0,0,0.4)] ${glow ? "ring-2 ring-green-500/80" : ""}`}
      style={{ background: MAROON }}
    >
      <svg viewBox="0 0 70 100" className="size-full" aria-hidden="true">
        <defs>
          <pattern id="whot-back" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill={MAROON} />
            <rect width="5" height="10" fill="#8a2a49" />
          </pattern>
        </defs>
        <rect x="4" y="4" width="62" height="92" rx="6" fill="url(#whot-back)" stroke="#e8c98f" strokeWidth="1.2" />
        <rect x="12" y="38" width="46" height="24" rx="4" fill={MAROON} stroke="#e8c98f" strokeWidth="1" />
        <text x="35" y="55" textAnchor="middle" fontSize="12" fontWeight="900" fill="#e8c98f" fontFamily="Georgia, serif" letterSpacing="1">
          WHOT
        </text>
      </svg>
    </div>
  );
}
