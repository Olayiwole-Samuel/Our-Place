"use client";

import { m } from "motion/react";
import { useEffect, useRef } from "react";
import { useCountdown } from "@/games/shared/useCountdown";
import { playSound } from "@/lib/ui/sounds";
import { QUESTION_MS } from "./rules";

/**
 * General Trivia — the in-room panel. Renders the server's view and sends
 * intents only (answer / time_up / next / resign). The right answer and your
 * partner's choice arrive only at the reveal. A bar counts the 15 seconds down.
 */
export default function GeneralTrivia({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { phase, question, answer, myAnswer, partnerAnswered, partnerAnswer, gained, scores, round, rounds, deadline } = view;
  const live = status === "active";
  const asking = live && phase === "question";
  const left = useCountdown(deadline, { active: asking, onEnd: () => act("time_up", {}) });
  const canAnswer = asking && myAnswer === null && !busy && left > 0;
  const revealed = phase === "reveal" || !live;

  const shown = useRef(null);
  useEffect(() => {
    if (phase === "reveal" && shown.current !== round) {
      shown.current = round;
      playSound(myAnswer === answer ? "capture" : "move");
    }
  }, [phase, round, myAnswer, answer]);

  const myGain = gained?.[me] ?? 0;
  const line = asking
    ? myAnswer !== null
      ? `Locked in — waiting for ${partnerName}…`
      : partnerAnswered
        ? `${partnerName} has answered — hurry!`
        : "First right answer gets +5"
    : myAnswer === answer
      ? `Right! +${myGain}${myGain > 10 ? " (you were first ⚡)" : ""}`
      : myAnswer === null
        ? "Time's up ⏰"
        : "Not this one 😅";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">General trivia ❓</p>
        <p className="text-micro tracking-normal text-text-muted">
          <span className="mr-2 font-semibold text-white-soft">
            You {scores[me] ?? 0} · {partnerName} {scores[partner] ?? 0}
          </span>
          {Math.min(round, rounds)} of {rounds}
        </p>
      </div>

      {asking && (
        <div className="h-1.5 overflow-hidden rounded-full bg-black-700" role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
          <div className={`h-full rounded-full transition-[width] duration-200 ease-linear ${left < 5 ? "bg-pink-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, (left * 1000 * 100) / QUESTION_MS)}%` }} />
        </div>
      )}

      <m.p key={question.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[var(--radius-md)] bg-[linear-gradient(135deg,#16202a,#1f2a44)] px-4 py-3 text-center text-[1.02rem] leading-snug font-semibold text-white-soft">
        {question.text}
      </m.p>

      <div className="grid grid-cols-2 gap-2">
        {question.options.map((option, index) => {
          const mine = myAnswer === index;
          const theirs = revealed && partnerAnswer === index;
          const right = revealed && answer === index;
          const wrongPick = revealed && mine && !right;
          return (
            <m.button
              key={`${question.id}-${index}`}
              type="button"
              aria-pressed={mine}
              aria-disabled={!canAnswer}
              whileTap={canAnswer ? { scale: 0.97 } : undefined}
              onClick={() => canAnswer && act("answer", { index })}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-center text-caption text-white-soft ${
                right ? "border-green-500 bg-green-700/40" : wrongPick ? "border-red-500/70 bg-red-500/15" : mine ? "border-blue-400 bg-black-700" : "border-[var(--border-subtle)] bg-black-800"
              } ${canAnswer ? "cursor-pointer hover:bg-black-700" : "cursor-default"}`}
            >
              {option}
              {revealed && (mine || theirs) && (
                <span className="flex gap-1">
                  {mine && <span className="wyr-reveal rounded-full bg-green-600 px-1.5 text-[0.62rem] text-white">You</span>}
                  {theirs && <span className="wyr-reveal rounded-full bg-pink-500 px-1.5 text-[0.62rem] text-black-950">{partnerName}</span>}
                </span>
              )}
            </m.button>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className={`min-h-5 text-center text-caption ${revealed && myAnswer === answer ? "font-semibold text-green-400" : "text-text-secondary"}`}>
        {line}
      </p>

      {phase === "reveal" && live && (
        <button type="button" disabled={busy} onClick={() => act("next", {})} className="min-h-11 min-w-40 self-center rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white">
          {round >= rounds ? "See who won" : "Next question"}
        </button>
      )}
    </div>
  );
}
