"use client";

import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";
import { REACTIONS, SEGMENTS } from "./rules";

/**
 * Question Roulette (18+) — the in-room panel. Renders the server's view and
 * sends intents only: spin · answered · pass · react { emoji } · finish.
 * Where the wheel lands is the server's (it's in the view only after the
 * spin); the wheel then turns a few times and settles on that segment, and the
 * question appears once it stops — on both screens.
 */
const LEVEL = {
  flirty: { label: "Flirty", emoji: "🌸", color: "#c2417a" },
  spicy: { label: "Spicy", emoji: "🌶️", color: "#d9482b" },
  hot: { label: "Hot", emoji: "🔥", color: "#8f1430" },
  wild: { label: "Wild card", emoji: "🎲", color: "#5b2a8a" },
};
const SPIN_MS = 2600;
const SLICE = 360 / SEGMENTS.length;

export default function QuestionRoulette({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { phase, segment, level, prompt, reaction, round, rounds } = view;
  const myTurn = status === "active" && view.current === me;
  const live = status === "active" && phase !== "finished";

  // The wheel keeps turning forward: each landing adds a few whole turns.
  const [angle, setAngle] = useState(() => (segment === null ? 0 : -segment * SLICE));
  const [settled, setSettled] = useState(segment !== null);
  const spunRound = useRef(segment === null ? null : round);
  useEffect(() => {
    if (segment === null) {
      setSettled(false);
      return undefined;
    }
    if (spunRound.current === round) return undefined;
    spunRound.current = round;
    setSettled(false);
    playSound("move");
    setAngle((current) => {
      const base = Math.ceil(current / 360) * 360 - 360 * 4; // four turns on (negative = clockwise visually)
      return base - segment * SLICE - (Math.random() - 0.5) * SLICE * 0.6;
    });
    const timer = setTimeout(() => setSettled(true), SPIN_MS);
    return () => clearTimeout(timer);
  }, [segment, round]);

  const showQuestion = prompt && settled;
  const info = level ? LEVEL[level] : null;
  const line =
    phase === "spin"
      ? myTurn
        ? "Your turn — spin the wheel!"
        : `${partnerName} is about to spin…`
      : !settled
        ? "Spinning…"
        : phase === "answer"
          ? myTurn
            ? "Answer it, then tap Answered"
            : `${partnerName} is answering 👀`
          : "";

  // A conic wheel: one coloured slice per segment, labels on top.
  const gradient = `conic-gradient(${SEGMENTS.map((s, i) => `${LEVEL[s].color} ${i * SLICE}deg ${(i + 1) * SLICE}deg`).join(", ")})`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-red-500">Question Roulette 🎰</p>
        <p className="text-micro tracking-normal text-text-muted">
          Spin {Math.min(round, rounds)} of {rounds}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <span aria-hidden="true" className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-[1.2rem] leading-none text-white drop-shadow">
            ▼
          </span>
          <div
            role="img"
            aria-label={info && settled ? `The wheel landed on ${info.label}` : "The wheel"}
            className="relative size-[var(--wheel)] rounded-full border-4 border-white/15 shadow-[0_6px_24px_rgba(0,0,0,0.5)]"
            style={{
              "--wheel": "clamp(7.5rem, min(32vmin, 40vw), 11rem)",
              background: gradient,
              transform: `rotate(${angle - SLICE / 2}deg)`,
              transition: spunRound.current === round && !settled ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.21, 1)` : "none",
            }}
          >
            {SEGMENTS.map((s, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 text-[clamp(0.85rem,3.4vmin,1.2rem)] leading-none"
                style={{ transform: `rotate(${i * SLICE + SLICE / 2}deg) translateY(calc(var(--wheel) * -0.34)) rotate(${-(i * SLICE + SLICE / 2)}deg)`, translate: "-50% -50%" }}
              >
                {LEVEL[s].emoji}
              </span>
            ))}
            <span aria-hidden="true" className="absolute inset-[38%] rounded-full bg-black-900 ring-2 ring-white/20" />
          </div>
        </div>

        <div className="flex min-h-28 w-full flex-1 flex-col justify-center">
          {showQuestion ? (
            <m.div
              key={`${round}-${prompt.id}`}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative rounded-[var(--radius-md)] border border-white/10 px-4 py-3"
              style={{ background: `linear-gradient(135deg, ${info.color}55, #1a0d14)` }}
            >
              <p className="micro-caps mb-1 text-white/75">
                {info.emoji} {info.label} · {myTurn ? "for you" : `for ${partnerName}`}
              </p>
              <p className="text-body leading-snug text-white-soft">{prompt.text}</p>
              {reaction && (
                <span key={reaction.emoji} className="wyr-reveal absolute top-2 right-2 rounded-full bg-black-900/80 px-2 py-0.5 text-[1.3rem] shadow-lg" aria-label={`${reaction.by === me ? "You" : partnerName} reacted ${reaction.emoji}`}>
                  {reaction.emoji}
                </span>
              )}
            </m.div>
          ) : (
            <p className="text-center text-caption text-text-muted sm:text-left">🌸 Flirty · 🌶️ Spicy · 🔥 Hot · 🎲 Wild card</p>
          )}
        </div>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-center text-caption text-text-secondary">
        {line}
      </p>

      {phase === "spin" && myTurn && (
        <button type="button" disabled={busy} onClick={() => act("spin", {})} className="min-h-11 min-w-40 self-center rounded-[var(--radius-md)] bg-red-500 px-5 text-body font-semibold text-white transition-transform active:scale-[0.98]">
          Spin 🎰
        </button>
      )}
      {phase === "answer" && settled && live && myTurn && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" disabled={busy} onClick={() => act("answered", {})} className="min-h-11 min-w-32 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white transition-transform active:scale-[0.98]">
            Answered ✓
          </button>
          <button type="button" disabled={busy} onClick={() => act("pass", {})} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 text-caption text-text-secondary hover:bg-black-700">
            Pass 🙈
          </button>
        </div>
      )}
      {phase === "answer" && settled && live && !myTurn && (
        <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label="React">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={busy}
              aria-label={`React ${emoji}`}
              aria-pressed={reaction?.emoji === emoji}
              onClick={() => act("react", { emoji })}
              className={`grid size-10 place-items-center rounded-full text-[1.2rem] transition-transform active:scale-90 ${reaction?.emoji === emoji ? "bg-red-500/35" : "bg-black-800 hover:bg-black-700"}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {live && (
        <button type="button" onClick={() => act("finish", {})} disabled={busy} className="self-center text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Finish game
        </button>
      )}
    </div>
  );
}
