"use client";

import { m } from "motion/react";

/**
 * Guess My Answer — the in-room panel. Renders the server's view and sends
 * intents only (choose / next / finish). Picks are secret until you've both chosen.
 */
export default function GuessMyAnswer({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { phase, question, subject, myChoice, partnerChose, partnerChoice, myNext, partnerNext, round, rounds, scores } = view;
  const live = status === "active" && phase !== "finished";
  const iAmSubject = subject === me;
  const revealing = phase === "revealing" || (phase === "finished" && myChoice !== null && partnerChoice !== null);
  const canChoose = live && phase === "choosing" && myChoice === null && !busy;
  if (!question) return <p className="py-8 text-center text-caption text-text-muted">Setting up your game…</p>;

  const right = revealing && myChoice === partnerChoice;
  const line =
    phase === "choosing"
      ? myChoice !== null
        ? `Waiting for ${partnerName}…`
        : iAmSubject
          ? `What's YOUR answer? ${partnerName} is predicting it${partnerChose ? " (they've picked 👀)" : ""}`
          : `What would ${partnerName} say?${partnerChose ? " (they've picked 👀)" : ""}`
      : right
        ? iAmSubject
          ? `${partnerName} read your mind 🔮`
          : "You read their mind! +1 🔮"
        : iAmSubject
          ? `${partnerName} guessed wrong 😄`
          : "Not this time 😄";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">Guess my answer 🔮</p>
        <p className="text-micro tracking-normal text-text-muted">
          <span className="mr-2 text-pink-400">
            You {scores[me] ?? 0} · {partnerName} {scores[partner] ?? 0}
          </span>
          Round {round} of {rounds}
        </p>
      </div>

      <m.p key={question.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[var(--radius-md)] bg-[linear-gradient(135deg,#2b1530,#16202a)] px-4 py-3 text-center text-[1.02rem] leading-snug font-semibold text-white-soft">
        {question.text}
        <span className="mt-0.5 block text-micro font-normal tracking-normal text-text-secondary">{iAmSubject ? "About you" : `About ${partnerName}`}</span>
      </m.p>

      <div className="grid grid-cols-2 gap-2">
        {question.options.map((option, index) => {
          const mine = myChoice === index;
          const theirs = revealing && partnerChoice === index;
          return (
            <m.button
              key={index}
              type="button"
              aria-pressed={mine}
              aria-disabled={!canChoose}
              whileTap={canChoose ? { scale: 0.97 } : undefined}
              onClick={() => canChoose && act("choose", { index })}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-center text-caption text-white-soft ${
                mine ? "border-green-500 bg-green-700/35" : theirs ? "border-pink-400/70 bg-black-800" : "border-[var(--border-subtle)] bg-black-800"
              } ${canChoose ? "cursor-pointer hover:bg-black-700" : "cursor-default"}`}
            >
              {option}
              {revealing && (mine || theirs) && (
                <span className="flex gap-1">
                  {mine && <span className="wyr-reveal rounded-full bg-green-600 px-1.5 text-[0.62rem] text-white">You</span>}
                  {theirs && <span className="wyr-reveal rounded-full bg-pink-500 px-1.5 text-[0.62rem] text-black-950">{partnerName}</span>}
                </span>
              )}
            </m.button>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className={`min-h-5 text-center text-caption ${revealing && right ? "font-semibold text-pink-400" : "text-text-secondary"}`}>
        {line}
      </p>

      {phase === "revealing" && (
        <div className="flex flex-col items-center gap-1">
          {myNext ? (
            <p className="text-caption text-text-muted">Waiting for {partnerName}…</p>
          ) : (
            <button type="button" disabled={busy} onClick={() => act("next", {})} className="min-h-11 min-w-40 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white">
              {round >= rounds ? "See how it went" : "Next one"}
            </button>
          )}
          {partnerNext && !myNext && <p className="text-micro tracking-normal text-text-muted">{partnerName} is ready</p>}
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
