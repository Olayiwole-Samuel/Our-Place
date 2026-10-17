"use client";

import { ImagePlus } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCouplePhotos } from "@/lib/couple/photos";
import { playSound } from "@/lib/ui/sounds";
import { HOME, PIECES_PER_PLAYER, YARD, pieceIds, seatOfPiece, zoneOf } from "./board";
import { BOARD_CELLS, GRID, orient, piecePoint } from "./layout";
import { Customise } from "./Customise";
import { PhotoLayer } from "./PhotoLayer";

/**
 * Naija Ludo board. Renders the server's view and sends intents only:
 *   act("roll", {})                         the server throws both dice
 *   act("move", { pieceId, use })           which dice ("die0" | "die1" | "both") go to which piece
 * Interaction: roll → tap a piece. If the server lists one way for that piece
 * to use the dice, it moves at once; if several (5, 3 or 8), a small choice
 * appears right at the piece. Movement, dice and kill animations are
 * presentation only: positions always settle on the latest server view.
 *
 * Layers: the static board (BoardArt) → the couple's photos (PhotoLayer, a
 * separate memoised personalisation layer the rules know nothing about) →
 * dice, pieces and choices (gameplay).
 *
 * Everything around the board (session, header, leave, result, chat, voice,
 * emotes) is the game shell's.
 */
const SEAT_STYLE = [
  { fill: "var(--color-pink-400)", strong: "var(--color-pink-600)", soft: "rgba(243,166,185,0.16)", text: "text-pink-400" },
  { fill: "var(--color-blue-400)", strong: "var(--color-blue-600)", soft: "rgba(125,211,252,0.15)", text: "text-blue-400" },
];
const STEP = 0.1; // seconds per square when a piece walks
const pct = (value) => `${(value / GRID) * 100}%`;
const ZONE_LABEL = { yard: "in the yard", track: "on the track", lane: "in the home lane", home: "home" };
const optionTotal = (o) => o.values.reduce((sum, v) => sum + v, 0);
const initialOf = (profile, fallback) => profile?.displayName?.trim()?.[0]?.toUpperCase() ?? fallback;
/** Google profile pictures come small by default; ask for a board-sized one. */
const sized = (url) => (typeof url === "string" ? url.replace(/=s\d+-c$/, "=s256-c") : null);

export default function Ludo({ view, me, partner, names = {}, profiles = {}, status, busy, act }) {
  const reduced = useReducedMotion();
  const partnerName = names[partner] ?? "Your partner";
  const mySeat = view.mySeat >= 0 ? view.mySeat : 0;
  const partnerSeat = 1 - mySeat;
  const active = status === "active" && view.phase !== "finished";
  const myTurn = active && view.current === me;
  const canRoll = myTurn && view.phase === "awaiting_roll" && !busy;
  const myOptions = myTurn && view.phase === "awaiting_move" ? view.options : [];
  const movable = new Set(myOptions.map((o) => o.pieceId));
  const [rolling, setRolling] = useState(false);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const photos = useCouplePhotos();
  const [customising, setCustomising] = useState(false);

  // A move or roll from before this board mounted (a reload) isn't replayed.
  const firstMove = useRef(view.lastMove?.number ?? 0);
  const firstRoll = useRef(view.lastRoll?.number ?? 0);

  // A new server state closes any open choice.
  const stateKey = `${view.rolls}:${view.lastMove?.number ?? 0}:${view.phase}`;
  useEffect(() => {
    setSelected(null);
    setPreview(null);
  }, [stateKey]);

  const roll = async () => {
    if (!canRoll || rolling) return;
    setRolling(true);
    try {
      await act("roll", {});
    } finally {
      setRolling(false);
    }
  };
  const send = (option) => {
    setSelected(null);
    setPreview(null);
    act("move", { pieceId: option.pieceId, use: option.use });
  };
  const tapPiece = (pieceId) => {
    if (!movable.has(pieceId) || busy) return;
    const choices = myOptions.filter((o) => o.pieceId === pieceId);
    if (choices.length === 1) send(choices[0]);
    else setSelected((current) => (current === pieceId ? null : pieceId));
  };

  // Subtle sounds through the app's existing sound system (respects its setting).
  const rollNumber = view.lastRoll?.number ?? 0;
  const moveNumber = view.lastMove?.number ?? 0;
  const kills = view.lastMove?.captured?.length ?? 0;
  useEffect(() => {
    if (rollNumber > firstRoll.current) playSound("dice");
  }, [rollNumber]);
  useEffect(() => {
    if (moveNumber > firstMove.current && kills) playSound("capture");
  }, [moveNumber, kills]);

  // Keyboard: R / Space rolls, 1–4 taps that piece, Escape closes a choice. Not while typing.
  const keys = useRef({});
  keys.current = { canRoll, roll, tapPiece, letter: mySeat === 0 ? "A" : "B", close: () => setSelected(null) };
  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const k = keys.current;
      if (event.key === "Escape") return k.close();
      if (event.target?.closest?.("input, textarea, select, [contenteditable='true'], button")) return;
      if ((event.key === "r" || event.key === "R" || event.key === " ") && k.canRoll) {
        event.preventDefault();
        k.roll();
      } else if (/^[1-4]$/.test(event.key)) k.tapPiece(`${k.letter}${event.key}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { pieces, lastMove } = view;
  const plans = useMemo(() => piecePlans({ pieces, lastMove }, mySeat, reduced, firstMove.current), [pieces, lastMove, mySeat, reduced]);
  const previewPoint = preview ? orient(piecePoint(mySeat, preview.to, Number(preview.pieceId[1]) - 1), mySeat) : null;
  const { line, event } = statusLines(view, me, partnerName);
  const homeCount = (seat) => pieceIds(seat).filter((id) => view.pieces[id] >= HOME).length;
  // Personalisation: plain strings only, so the photo layer ignores game updates.
  const portrait = (id) => photos?.partners?.find((p) => p.userId === id)?.url || sized(profiles[id]?.avatarUrl) || profiles[id]?.avatarThumbnail || null;
  const [topLeftPhoto, bottomRightPhoto] = mySeat === 0 ? [photos?.togetherA, photos?.togetherB] : [photos?.togetherB, photos?.togetherA];
  const myDice = view.current === me ? view.dice : null;
  const partnerDice = view.current === partner ? view.dice : null;

  return (
    <div className="ludo flex flex-col items-center gap-3 sm:flex-row sm:items-stretch sm:justify-center sm:gap-[clamp(10px,2vmin,20px)]">
      <div className="ludo-board relative shrink-0 select-none" style={{ containerType: "size" }} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
        <BoardArt viewerSeat={mySeat} />
        <PhotoLayer
          myPhoto={portrait(me)}
          partnerPhoto={portrait(partner)}
          myInitial={initialOf(profiles[me], "Y")}
          partnerInitial={initialOf(profiles[partner], partnerName[0])}
          topLeftPhoto={topLeftPhoto ?? null}
          bottomRightPhoto={bottomRightPhoto ?? null}
          mySeatColor={SEAT_STYLE[mySeat]}
          partnerSeatColor={SEAT_STYLE[partnerSeat]}
        />

        <PlayerCorner corner="top-left" name={partnerName} seat={partnerSeat} isTurn={active && view.current === partner} roll={view.lastRoll?.by === partner ? view.lastRoll : null} dice={partnerDice} reduced={reduced} />
        <PlayerCorner
          corner="bottom-right"
          name="You"
          seat={mySeat}
          isTurn={myTurn}
          roll={view.lastRoll?.by === me ? view.lastRoll : null}
          dice={myDice}
          canRoll={canRoll}
          rolling={rolling}
          onRoll={roll}
          reduced={reduced}
        />

        {previewPoint && (
          <span
            aria-hidden="true"
            data-preview
            className="pointer-events-none absolute z-10 size-[5.4%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.45cqw] border-dashed"
            style={{ top: pct(previewPoint[0]), left: pct(previewPoint[1]), borderColor: SEAT_STYLE[mySeat].fill }}
          />
        )}

        {[0, 1].flatMap((seat) =>
          pieceIds(seat).map((id) => {
            const canMove = movable.has(id) && !busy;
            const owner = seat === mySeat ? "Your" : `${partnerName}'s`;
            return (
              <m.button
                key={id}
                type="button"
                data-piece={id}
                aria-label={canMove ? `Move piece ${id}` : `${owner} piece ${id}, ${ZONE_LABEL[zoneOf(view.pieces[id])]}`}
                aria-expanded={canMove ? selected === id : undefined}
                disabled={!canMove}
                onClick={() => tapPiece(id)}
                initial={false}
                animate={plans[id].animate}
                transition={plans[id].transition}
                className={`ludo-piece absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center font-semibold text-black-950 outline-offset-2 focus-visible:outline-2 focus-visible:outline-white ${seat === 0 ? "rounded-full" : "rounded-[28%]"} ${
                  canMove ? "ludo-piece-legal z-20 cursor-pointer" : "z-10 cursor-default"
                } ${selected === id ? "ludo-piece-selected" : ""}`}
                style={{
                  width: "5.4%",
                  height: "5.4%",
                  fontSize: "2.6cqw",
                  background: `radial-gradient(circle at 35% 30%, #fff8 0, transparent 45%), ${SEAT_STYLE[seat].fill}`,
                  boxShadow: `0 0.35cqw 0 ${SEAT_STYLE[seat].strong}, 0 0.8cqw 1.4cqw rgba(0,0,0,0.45)`,
                }}
              >
                <span aria-hidden="true">{id[1]}</span>
              </m.button>
            );
          }),
        )}

        <AnimatePresence>
          {selected && (
            <DiceChoice key={selected} options={myOptions.filter((o) => o.pieceId === selected)} point={plans[selected].point} pieceId={selected} onChoose={send} onPreview={setPreview} reduced={reduced} />
          )}
        </AnimatePresence>
      </div>

      <aside className="flex w-full max-w-[22rem] flex-col gap-1.5 sm:w-auto sm:max-w-52 sm:min-w-32 sm:flex-1 sm:gap-2 sm:py-1" aria-label="Turn">
        {/* The turn line stays mounted (and announced) even while customising. */}
        <p role="status" aria-live="polite" className={`text-body leading-snug font-semibold text-white-soft ${customising ? "sr-only" : ""}`}>
          {line}
        </p>
        {customising ? (
          <Customise photos={photos} mySeat={mySeat} me={me} partner={partner} partnerName={partnerName} onClose={() => setCustomising(false)} />
        ) : (
          <>
            <p aria-live="polite" className="min-h-5 text-caption text-text-secondary" data-event>
              {event}
            </p>
            {myDice && <DiceLeft dice={myDice} />}
          </>
        )}
        <div className={`${customising ? "" : "mt-auto"} flex items-stretch gap-2`}>
          <dl className="grid flex-1 grid-cols-2 gap-2 text-caption">
            {[
              [mySeat, "You"],
              [partnerSeat, partnerName],
            ].map(([seat, label]) => (
              <div key={seat} className="min-w-0 rounded-[var(--radius-md)] bg-black-800 px-3 py-1.5">
                <dt className={`truncate text-micro tracking-normal ${SEAT_STYLE[seat].text}`}>{label}</dt>
                <dd className="text-white-soft tabular-nums">
                  {homeCount(seat)}/{PIECES_PER_PLAYER} home
                </dd>
              </div>
            ))}
          </dl>
          {!customising && (
            <button
              type="button"
              onClick={() => setCustomising(true)}
              aria-label="Customise board"
              className="grid min-h-11 min-w-11 place-items-center rounded-[var(--radius-md)] bg-black-800 text-text-secondary hover:bg-black-700 hover:text-white-soft"
            >
              <ImagePlus aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

/** "5 used · 3 left" — what's been spent of this throw. */
function DiceLeft({ dice }) {
  return (
    <p className="text-caption text-text-muted" data-dice-left>
      {dice.map((die, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <span className={die.used ? "line-through opacity-60" : "font-semibold text-white-soft"}>
            {die.value} {die.used ? "used" : "left"}
          </span>
        </span>
      ))}
    </p>
  );
}

/**
 * The small choice that appears at a piece when the dice can be used more than
 * one way: each die alone (above / below the piece), or both together (beside it).
 */
function DiceChoice({ options, point, pieceId, onChoose, onPreview, reduced }) {
  const singles = options.filter((o) => o.use !== "both");
  const both = options.find((o) => o.use === "both");
  const [r, c] = point;
  const placeLeft = c > GRID / 2;
  const slots = [...singles.map((o, i) => ({ o, dy: i === 0 ? -1 : 1, dx: 0 })), ...(both ? [{ o: both, dy: 0, dx: placeLeft ? -1 : 1 }] : [])];
  return (
    <m.div
      role="group"
      aria-label={`Use dice for piece ${pieceId}`}
      className="absolute z-30"
      style={{ top: pct(r), left: pct(c) }}
      initial={reduced ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
    >
      {slots.map(({ o, dx, dy }) => (
        <button
          key={o.use}
          type="button"
          aria-label={`Move piece ${pieceId} ${optionTotal(o)}${o.use === "both" ? ` (${o.values[0]} + ${o.values[1]})` : ""}${o.captures.length ? ", capture" : ""}${o.to >= HOME ? ", home" : ""}`}
          onClick={() => onChoose(o)}
          onPointerEnter={() => onPreview(o)}
          onPointerLeave={() => onPreview(null)}
          onFocus={() => onPreview(o)}
          onBlur={() => onPreview(null)}
          className="ludo-choice absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-black-950 font-semibold text-white-soft shadow-[0_6px_18px_rgba(0,0,0,0.5)] outline-offset-2 hover:bg-black-700 focus-visible:outline-2 focus-visible:outline-white"
          style={{ left: `calc(${dx} * var(--choice-gap))`, top: `calc(${dy} * var(--choice-gap))` }}
        >
          <span className="leading-none">{optionTotal(o)}</span>
          {o.use === "both" && (
            <span className="text-[0.6rem] leading-none font-normal text-text-muted">
              {o.values[0]}+{o.values[1]}
            </span>
          )}
          {o.captures.length > 0 && (
            <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 text-[0.7rem]">
              💥
            </span>
          )}
        </button>
      ))}
    </m.div>
  );
}

/** Status line (whose turn, what was rolled) and the last notable event. */
export function statusLines(view, me, partnerName) {
  const roll = view.lastRoll;
  const mine = roll?.by === me;
  const who = mine ? "You" : partnerName;
  const rolled = roll ? `${roll.values[0]} + ${roll.values[1]}` : "";
  let line;
  if (view.phase === "finished") line = view.winnerId === me ? "All four home — you win!" : `${partnerName} got all four home.`;
  else if (view.current === me) {
    if (view.phase === "awaiting_move") line = roll?.doubleSix ? "Double six! Tap a piece" : `You rolled ${rolled} — tap a piece`;
    else if (view.extraRoll === "double_six") line = "Double six! Roll again.";
    else if (view.extraRoll === "capture") line = "Nice! Roll again."; // games started before kills stopped earning a roll
    else line = "Your turn — roll the dice";
  } else if (view.phase === "awaiting_move") line = `${partnerName} rolled ${rolled}`;
  else if (view.extraRoll) line = `${partnerName} rolls again`;
  else line = `Waiting for ${partnerName}…`;

  let event = "";
  const move = view.lastMove;
  const latestMove = move && move.roll === view.rolls;
  if (roll?.outcome === "no_move") event = `${who} rolled ${rolled} — no move.`;
  else if (latestMove && move.captured.length) event = move.by === me ? `You captured ${partnerName}'s piece 💥 — yours went home` : `${partnerName} captured your piece — theirs went home`;
  else if (latestMove && move.home) event = `${move.by === me ? "Your" : `${partnerName}'s`} piece made it home 🏠`;
  if (latestMove && view.forfeited?.length && roll?.outcome === "play") event = `${event ? `${event} ` : ""}${view.forfeited.join(" + ")} couldn't be used.`;
  return { line, event };
}

/**
 * Where each piece should be drawn, with stepped keyframes along the server's
 * `lastMove.hops` for the move that just happened (and the killed piece's trip
 * back to the yard). Recomputed from the server view every time, so a late or
 * repeated update can only settle a piece where the server says it is.
 */
export function piecePlans(view, viewerSeat, reduced, firstMove) {
  const points = {};
  const groups = new Map();
  for (const seat of [0, 1]) {
    pieceIds(seat).forEach((id, index) => {
      const point = orient(piecePoint(seat, view.pieces[id], index), viewerSeat);
      points[id] = point;
      const zone = zoneOf(view.pieces[id]);
      if (zone === "track" || zone === "lane") {
        const key = `${point[0].toFixed(2)}:${point[1].toFixed(2)}`;
        groups.set(key, [...(groups.get(key) ?? []), id]);
      }
    });
  }
  // Pieces sharing a square fan out slightly so each stays visible and tappable.
  const offset = {};
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id, i) => {
      const angle = (i / ids.length) * Math.PI * 2 - Math.PI / 4;
      offset[id] = [Math.sin(angle) * 0.24, Math.cos(angle) * 0.24];
    });
  }
  const final = (id) => {
    const [r, c] = points[id];
    const [dr, dc] = offset[id] ?? [0, 0];
    return [r + dr, c + dc];
  };

  const plans = {};
  for (const id of Object.keys(points)) {
    const [r, c] = final(id);
    plans[id] = { point: [r, c], animate: { top: pct(r), left: pct(c), scale: offset[id] ? 0.86 : 1 }, transition: { duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] } };
  }
  const move = view.lastMove;
  // A killer walks to the square it took, then steps off the board to home.
  const killedHome = move?.captured?.length > 0 && view.pieces[move?.pieceId] >= HOME;
  if (!move || move.number <= firstMove || reduced || (view.pieces[move.pieceId] !== move.to && !killedHome)) return plans;

  const seat = seatOfPiece(move.pieceId);
  const index = Number(move.pieceId[1]) - 1;
  const path = [piecePoint(seat, move.from, index), ...move.hops.map((p) => piecePoint(seat, p, index))].map((p) => orient(p, viewerSeat));
  if (killedHome) path.push(final(move.pieceId));
  else path[path.length - 1] = final(move.pieceId);
  const walk = Math.max(1, path.length - 1) * STEP;
  plans[move.pieceId] = {
    ...plans[move.pieceId],
    animate: { top: path.map(([r]) => pct(r)), left: path.map(([, c]) => pct(c)), scale: path.map((_, i) => (i === 0 || i === path.length - 1 ? 1 : 1.14)) },
    transition: { duration: walk, ease: "linear" },
  };
  for (const { pieceId, from } of move.captured) {
    if (view.pieces[pieceId] !== YARD) continue;
    const at = orient(piecePoint(seatOfPiece(pieceId), from, Number(pieceId[1]) - 1), viewerSeat);
    const [r, c] = final(pieceId);
    const total = walk + 0.45;
    const hold = walk / total;
    plans[pieceId] = {
      ...plans[pieceId],
      animate: { top: [pct(at[0]), pct(at[0]), pct(at[0]), pct(r)], left: [pct(at[1]), pct(at[1]), pct(at[1]), pct(c)], scale: [1, 1, 1.3, 1], opacity: [1, 1, 0.55, 1] },
      transition: { duration: total, times: [0, hold, hold + 0.12 * (1 - hold), 1], ease: "easeOut" },
    };
  }
  return plans;
}

/** The static board: track, start tiles, lanes, yards and the home centre. */
function BoardArt({ viewerSeat }) {
  const cell = (r, c) => (viewerSeat === 1 ? [GRID - 1 - r, GRID - 1 - c] : [r, c]);
  // In the viewer's frame your yard is bottom-left and your partner's top-right.
  const mine = SEAT_STYLE[viewerSeat];
  const theirs = SEAT_STYLE[1 - viewerSeat];
  return (
    <svg viewBox="0 0 15 15" className="absolute inset-0 size-full" aria-hidden="true">
      <rect x="0" y="0" width="15" height="15" rx="0.5" fill="var(--color-black-900)" />
      <Yard x={0} y={9} color={mine} />
      <Yard x={9} y={0} color={theirs} />
      <rect x="0.25" y="0.25" width="5.5" height="5.5" rx="0.45" fill="var(--color-black-800)" stroke="rgba(102,118,74,0.35)" strokeWidth="0.05" />
      <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="0.45" fill="var(--color-black-800)" stroke="rgba(102,118,74,0.35)" strokeWidth="0.05" />
      {BOARD_CELLS.map(({ r, c, kind, seat }) => {
        const [y, x] = cell(r, c);
        const color = seat !== undefined ? SEAT_STYLE[seat] : null;
        const fill = kind === "lane" || kind === "start" ? color.fill : "var(--color-black-800)";
        const opacity = kind === "lane" ? 0.32 : kind === "start" ? 0.5 : 1;
        return (
          <g key={`${r}-${c}`}>
            <rect x={x + 0.05} y={y + 0.05} width="0.9" height="0.9" rx="0.14" fill={fill} fillOpacity={opacity} stroke="var(--color-black-700)" strokeWidth="0.04" />
          </g>
        );
      })}
      <polygon points="6,9 9,9 7.5,7.5" fill={mine.fill} fillOpacity="0.55" />
      <polygon points="6,6 9,6 7.5,7.5" fill={theirs.fill} fillOpacity="0.55" />
      <polygon points="6,6 6,9 7.5,7.5" fill="var(--color-green-700)" fillOpacity="0.7" />
      <polygon points="9,6 9,9 7.5,7.5" fill="var(--color-green-700)" fillOpacity="0.7" />
      <text x="7.5" y="7.72" textAnchor="middle" fontSize="0.6">
        ❤️
      </text>
    </svg>
  );
}

function Yard({ x, y, color }) {
  return (
    <g>
      <rect x={x + 0.25} y={y + 0.25} width="5.5" height="5.5" rx="0.45" fill={color.soft} stroke={color.fill} strokeOpacity="0.55" strokeWidth="0.06" />
      <rect x={x + 1} y={y + 1} width="4" height="4" rx="0.4" fill="var(--color-black-950)" fillOpacity="0.7" />
      {[
        [1.9, 1.9],
        [4.1, 1.9],
        [1.9, 4.1],
        [4.1, 4.1],
      ].map(([dx, dy]) => (
        <circle key={`${dx}-${dy}`} cx={x + dx} cy={y + dy} r="0.42" fill="none" stroke={color.fill} strokeOpacity="0.45" strokeWidth="0.06" />
      ))}
    </g>
  );
}

/**
 * A player's dice tray, set on the together photo in the corner beside their
 * yard. On your turn the whole corner is the Roll button (a big touch target).
 */
function PlayerCorner({ corner, name, seat, isTurn, roll, dice, canRoll = false, rolling = false, onRoll, reduced }) {
  const position = corner === "top-left" ? { top: "1.67%", left: "1.67%" } : { top: "61.67%", left: "61.67%" };
  const yours = name === "You";
  const values = rolling ? [null, null] : dice ? dice.map((d) => d.value) : (roll?.values ?? [null, null]);
  const used = dice ? dice.map((d) => d.used) : [false, false];
  const hint = canRoll ? "Tap to roll" : rolling ? "Rolling…" : isTurn ? (dice ? (yours ? "Tap a piece" : "Choosing…") : yours ? "" : "Their turn") : "";
  const content = (
    <>
      {/* Who these dice belong to, as a small tag on the photo. */}
      <span className="ludo-tray absolute top-[5%] left-[6%] flex max-w-[88%] items-baseline gap-[1cqw] truncate rounded-[1cqw] px-[1.4cqw] py-[0.5cqw]" style={{ fontSize: "clamp(0.625rem, 2.5cqw, 0.8125rem)" }}>
        <span className={`font-semibold ${SEAT_STYLE[seat].text}`}>{name}</span>
        {hint && <span className="text-text-secondary">{hint}</span>}
      </span>
      {/* The dice tray: compact, so most of the photo stays visible. */}
      <span className="ludo-tray absolute inset-x-[16%] bottom-[5%] flex items-center justify-center gap-[8%] rounded-[1.6cqw] p-[1.4cqw]">
        {[0, 1].map((i) => (
          <Die key={i} value={values[i]} used={used[i]} rollKey={roll?.number ?? 0} index={i} seat={seat} dim={!isTurn && !dice} highlight={canRoll} rolling={rolling} reduced={reduced} />
        ))}
      </span>
    </>
  );
  const className = `absolute rounded-[1.4cqw] transition-[box-shadow] duration-300 ${isTurn ? "ludo-turn" : ""}`;
  const style = { ...position, width: "36.67%", height: "36.67%", "--ring": SEAT_STYLE[seat].fill };
  if (canRoll || rolling) {
    return (
      <button type="button" onClick={onRoll} disabled={!canRoll || rolling} aria-label={rolling ? "Rolling…" : "Roll dice"} className={`${className} cursor-pointer outline-offset-2 focus-visible:outline-2 focus-visible:outline-white`} style={style}>
        {content}
      </button>
    );
  }
  const shown = values.filter(Boolean);
  const label = shown.length ? `${yours ? "Your" : `${name}'s`} dice: ${shown.join(" and ")}${dice ? ` (${dice.filter((d) => !d.used).length} left)` : ""}` : `${yours ? "Your" : `${name}'s`} dice`;
  return (
    <div role="group" aria-label={label} className={className} style={style}>
      {content}
    </div>
  );
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** One die. Rolling = a short shake in the "cup"; then the server's value lands. */
function Die({ value, used, rollKey, index, seat, dim, highlight, rolling, reduced }) {
  return (
    <span aria-hidden="true" data-die={value ?? ""} data-used={used ? "true" : undefined} className={`relative block aspect-square w-[40%] transition-opacity duration-200 ${dim || used ? "opacity-40" : ""}`}>
      <m.span
        key={rolling ? "rolling" : `roll-${rollKey}`}
        initial={reduced || rolling ? false : { rotate: index ? 140 : -160, scale: 0.7, y: "-30%" }}
        animate={rolling && !reduced ? { rotate: index ? [0, -25, 20, 0] : [0, 25, -20, 0], x: ["0%", "-8%", "8%", "0%"], y: ["0%", "-10%", "0%", "-6%"] } : { rotate: 0, scale: 1, y: "0%", x: "0%" }}
        transition={rolling ? { duration: 0.32, repeat: Infinity, ease: "easeInOut" } : { type: "spring", stiffness: 420, damping: 20, delay: reduced ? 0 : index * 0.05 }}
        className="grid size-full grid-cols-3 grid-rows-3 gap-[8%] rounded-[22%] bg-white-soft p-[16%]"
        style={{ boxShadow: `inset 0 -0.6cqw 0 rgba(0,0,0,0.18), 0 0.6cqw 1.6cqw rgba(0,0,0,0.45)${highlight ? `, 0 0 0 0.6cqw ${SEAT_STYLE[seat].fill}` : ""}` }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`rounded-full ${value && PIPS[value].includes(i) ? "bg-black-950" : ""}`} />
        ))}
      </m.span>
    </span>
  );
}
