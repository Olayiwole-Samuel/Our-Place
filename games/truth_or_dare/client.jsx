"use client";

import { m } from "motion/react";
import { useEffect, useRef } from "react";
import { playSound } from "@/lib/ui/sounds";
import { REACTIONS } from "./rules";

/**
 * Truth or Dare (18+) — the in-room panel. Renders the server's view and sends
 * intents only: choose { kind } · done · chicken · react { emoji } · finish.
 * The prompt card flips in; your partner's reaction pops over it.
 */
export default function TruthOrDare({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { phase, prompt, reaction, round, rounds, tally, left } = view;
  const myTurn = status === "active" && view.current === me;
  const live = status === "active" && phase !== "finished";
  const who = myTurn ? "You" : partnerName;

  const promptKey = prompt ? `${round}-${prompt.id}` : null;
  const lastPrompt = useRef(promptKey);
  useEffect(() => {
    if (promptKey && promptKey !== lastPrompt.current) playSound("move");
    lastPrompt.current = promptKey;
  }, [promptKey]);

  const line =
    phase === "choosing"
      ? myTurn
        ? "Your turn — truth or dare?"
        : `${partnerName} is choosing…`
      : phase === "doing"
        ? myTurn
          ? prompt.kind === "truth"
            ? "Tell the truth… then tap Done"
            : "Do it… then tap Done"
          : `${partnerName}'s ${prompt.kind} — watch closely 👀`
        : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-red-500">Truth or Dare 😈</p>
        <p className="text-micro tracking-normal text-text-muted">
          Turn {Math.min(round, rounds)} of {rounds}
        </p>
      </div>

      {phase === "choosing" && (
        <div className="grid grid-cols-2 gap-2">
          {[
            ["truth", "Truth", "🤫", "bg-[linear-gradient(135deg,#3a1450,#6b2a8a)]"],
            ["dare", "Dare", "🔥", "bg-[linear-gradient(135deg,#5a0f1f,#b3263f)]"],
          ].map(([kind, label, emoji, bg]) => {
            const empty = left[kind] <= 0;
            const can = myTurn && !busy && !empty;
            return (
              <m.button
                key={kind}
                type="button"
                aria-disabled={!can}
                onClick={() => can && act("choose", { kind })}
                whileTap={can ? { scale: 0.96 } : undefined}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-white/10 ${bg} ${can ? "cursor-pointer hover:brightness-110" : "cursor-default opacity-60"}`}
              >
                <span aria-hidden="true" className="text-[1.8rem] leading-none">
                  {emoji}
                </span>
                <span className="text-body font-semibold text-white-soft">{label}</span>
                {empty && <span className="text-micro tracking-normal text-white/70">None left</span>}
              </m.button>
            );
          })}
        </div>
      )}

      {prompt && phase !== "choosing" && (
        <m.div
          key={promptKey}
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={`relative rounded-[var(--radius-md)] border px-4 py-4 ${prompt.kind === "truth" ? "border-purple-400/40 bg-[linear-gradient(135deg,#2a0f3a,#45195c)]" : "border-red-500/40 bg-[linear-gradient(135deg,#3d0a16,#7a1a2c)]"}`}
        >
          <p className="micro-caps mb-1.5 text-white/70">
            {who === "You" ? "Your" : `${partnerName}'s`} {prompt.kind} {prompt.kind === "truth" ? "🤫" : "🔥"}
          </p>
          <p className="text-body leading-snug text-white-soft">{prompt.text}</p>
          {reaction && (
            <span key={reaction.emoji + reaction.by} className="wyr-reveal absolute top-2 right-2 rounded-full bg-black-900/80 px-2 py-0.5 text-[1.3rem] shadow-lg" aria-label={`${reaction.by === me ? "You" : partnerName} reacted ${reaction.emoji}`}>
              {reaction.emoji}
            </span>
          )}
        </m.div>
      )}

      <p role="status" aria-live="polite" className="min-h-5 text-center text-caption text-text-secondary">
        {line}
      </p>

      {phase === "doing" && live && myTurn && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" disabled={busy} onClick={() => act("done", {})} className="min-h-11 min-w-32 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white transition-transform active:scale-[0.98]">
            Done ✓
          </button>
          <button type="button" disabled={busy} onClick={() => act("chicken", {})} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 text-caption text-text-secondary hover:bg-black-700">
            Chicken out 🐔
          </button>
        </div>
      )}
      {phase === "doing" && live && !myTurn && (
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

      <div className="flex justify-center gap-4 text-micro tracking-normal text-text-muted">
        {[
          [me, "You"],
          [partner, partnerName],
        ].map(([id, name]) => (
          <span key={id}>
            {name}: {tally[id]?.truth ?? 0} 🤫 · {tally[id]?.dare ?? 0} 🔥{tally[id]?.chicken ? ` · ${tally[id].chicken} 🐔` : ""}
          </span>
        ))}
      </div>

      {live && (
        <button type="button" onClick={() => act("finish", {})} disabled={busy} className="self-center text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Finish game
        </button>
      )}
    </div>
  );
}
