"use client";

import { m } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Would You Rather — the in-room panel. Renders the server's view and sends
 * intents only (answer / next / finish). Everything around it (session,
 * players, connection, leave, result, chat, voice, emotes) is the game shell's.
 *
 * Privacy: until both have answered, the partner's choice is never in the view
 * (the server withholds it) — only that they've answered.
 */
export default function WouldYouRather({ view, partner, names = {}, status, busy, act, spicy = false }) {
  const partnerName = names[partner] ?? "Your partner";
  const { phase, question, myAnswer, partnerAnswered, partnerAnswer, myNext, partnerNext, round, rounds, roundsPlayed = 0, matches = 0 } = view;
  const revealing = phase === "revealing" || (phase === "finished" && myAnswer && partnerAnswer);
  const canAnswer = status === "active" && phase === "answering" && !myAnswer && !busy;
  const firstOption = useRef(null);

  // Focus the question for keyboard users when a new round starts.
  useEffect(() => {
    if (phase === "answering" && !myAnswer) firstOption.current?.focus({ preventScroll: true });
  }, [round, phase, myAnswer]);

  if (!question) return <p className="py-8 text-center text-caption text-text-muted">Setting up your game…</p>;

  let line;
  if (phase === "answering") line = myAnswer ? `Waiting for ${partnerName}…` : partnerAnswered ? `❤️ ${partnerName} has answered` : "Choose one";
  else if (revealing) line = myAnswer === partnerAnswer ? "Same answer ❤️" : "You chose differently 👀";
  else line = "";

  const option = (letter, text, ref) => {
    const mine = myAnswer === letter;
    const theirs = revealing && partnerAnswer === letter;
    return (
      <m.button
        ref={ref}
        type="button"
        aria-label={`Option ${letter}: ${text}`}
        aria-pressed={mine}
        aria-disabled={!canAnswer}
        onClick={() => canAnswer && act("answer", { choice: letter })}
        whileTap={canAnswer ? { scale: 0.98 } : undefined}
        className={`relative flex min-h-24 flex-col items-start gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-[border-color,background-color] duration-150 motion-reduce:transition-none ${
          mine ? "border-green-500 bg-green-700/35" : theirs ? "border-pink-400/70 bg-black-800" : "border-[var(--border-subtle)] bg-black-800"
        } ${canAnswer ? "cursor-pointer hover:border-[var(--border-strong)] hover:bg-black-700" : "cursor-default"}`}
      >
        <span className={`grid size-6 place-items-center rounded-full text-micro font-semibold tracking-normal ${mine ? "bg-green-500 text-black-950" : "bg-black-700 text-text-secondary"}`}>
          {mine && !revealing ? <Check aria-hidden="true" size={13} strokeWidth={2.5} /> : letter}
        </span>
        <span className="text-body leading-snug text-white-soft">{text}</span>
        {revealing && (mine || theirs) && (
          <span className="mt-auto flex flex-wrap gap-1.5" aria-label={`Chosen by ${[mine && "you", theirs && partnerName].filter(Boolean).join(" and ")}`}>
            {mine && <span className="wyr-reveal rounded-full bg-green-600 px-2 py-0.5 text-micro tracking-normal text-white">You</span>}
            {theirs && (
              <span className="wyr-reveal rounded-full bg-pink-500 px-2 py-0.5 text-micro tracking-normal text-black-950" style={{ animationDelay: "120ms" }}>
                {partnerName}
              </span>
            )}
          </span>
        )}
      </m.button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`micro-caps ${spicy ? "text-red-500" : "text-pink-400"}`}>{spicy ? "Would you rather… 🌶️ after dark" : "Would you rather…"}</p>
        <p className="text-micro tracking-normal text-text-muted">
          {roundsPlayed > 0 && (
            <span className="mr-2 text-pink-400" aria-label={`You've matched ${matches} of ${roundsPlayed}`}>
              ❤️ {matches}/{roundsPlayed} matched
            </span>
          )}
          Round {round} of {rounds}
        </p>
      </div>

      <m.div key={question.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="grid gap-2 sm:grid-cols-2">
        {option("A", question.optionA, firstOption)}
        {option("B", question.optionB)}
      </m.div>

      <p role="status" aria-live="polite" className="min-h-5 text-center text-caption text-text-secondary">
        {revealing ? (
          <span key={`${round}-reveal`} className={`wyr-reveal inline-block ${myAnswer === partnerAnswer ? "font-semibold text-pink-400" : ""}`}>
            {line}
          </span>
        ) : (
          line
        )}
      </p>

      {phase === "revealing" && (
        <div className="flex flex-col items-center gap-1">
          {myNext ? (
            <p className="text-caption text-text-muted">Waiting for {partnerName}…</p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => act("next", {})}
              className="min-h-11 min-w-40 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white transition-transform active:scale-[0.98]"
            >
              {round >= rounds ? "See how it went" : "Next question"}
            </button>
          )}
          {partnerNext && !myNext && <p className="text-micro tracking-normal text-text-muted">{partnerName} is ready for the next one</p>}
        </div>
      )}

      {status === "active" && phase !== "finished" && (
        <button type="button" onClick={() => act("finish", {})} disabled={busy} className="self-center text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Finish game
        </button>
      )}
    </div>
  );
}
