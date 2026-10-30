"use client";

import { m } from "motion/react";

/**
 * Never Have I Ever — the in-room panel. Renders the server's view and sends
 * intents only (answer / next / finish). Your partner's answer is never in the
 * view until you've both answered; then both show together and fingers go down.
 */
const FINGER_ROW = 10;

function Fingers({ count, label, tone }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`${label}: ${count} fingers up`}>
      <span className="text-micro tracking-normal text-text-secondary">{label}</span>
      <span aria-hidden="true" className="flex gap-[2px]">
        {Array.from({ length: FINGER_ROW }, (_, i) => (
          <span key={i} className={`h-3.5 w-1.5 rounded-full transition-[height,opacity] duration-300 ${i < count ? tone : "h-1.5 bg-black-700 opacity-60"}`} />
        ))}
      </span>
    </span>
  );
}

export default function NeverHaveIEver({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { phase, statement, myAnswer, partnerAnswered, partnerAnswer, myNext, partnerNext, round, rounds, fingers } = view;
  const revealing = phase === "revealing" || (phase === "finished" && myAnswer && partnerAnswer);
  const canAnswer = status === "active" && phase === "answering" && !myAnswer && !busy;
  if (!statement) return <p className="py-8 text-center text-caption text-text-muted">Setting up your game…</p>;

  const line =
    phase === "answering"
      ? myAnswer
        ? `Waiting for ${partnerName}…`
        : partnerAnswered
          ? `${partnerName} has answered 👀`
          : "Be honest…"
      : revealing
        ? myAnswer === "have" && partnerAnswer === "have"
          ? "You've BOTH done it 🙈"
          : myAnswer === "never" && partnerAnswer === "never"
            ? "Neither of you — angels 😇"
            : partnerAnswer === "have"
              ? `${partnerName} has! Ask for the story 👀`
              : "Just you… spill the story 😏"
        : "";

  const choice = (value, label, emoji) => {
    const mine = myAnswer === value;
    const theirs = revealing && partnerAnswer === value;
    return (
      <m.button
        type="button"
        aria-pressed={mine}
        aria-disabled={!canAnswer}
        onClick={() => canAnswer && act("answer", { choice: value })}
        whileTap={canAnswer ? { scale: 0.96 } : undefined}
        className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-3 py-2 ${
          mine ? "border-green-500 bg-green-700/35" : theirs ? "border-pink-400/70 bg-black-800" : "border-[var(--border-subtle)] bg-black-800"
        } ${canAnswer ? "cursor-pointer hover:bg-black-700" : "cursor-default"}`}
      >
        <span className="text-body font-semibold text-white-soft">
          <span aria-hidden="true">{emoji}</span> {label}
        </span>
        {revealing && (mine || theirs) && (
          <span className="flex gap-1">
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
        <p className="micro-caps text-pink-400">Never have I ever… 🙊</p>
        <p className="text-micro tracking-normal text-text-muted">
          Round {round} of {rounds}
        </p>
      </div>

      <m.p
        key={statement.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="rounded-[var(--radius-md)] bg-[linear-gradient(135deg,#2b1530,#1a1420)] px-4 py-3 text-body leading-snug text-white-soft"
      >
        <span className="text-text-secondary">Never have I ever… </span>
        {statement.text}.
      </m.p>

      <div className="flex gap-2">
        {choice("have", "I have", "🙋")}
        {choice("never", "Never", "🙅")}
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-center text-caption text-text-secondary">
        {revealing ? <span key={`${round}-r`} className="wyr-reveal inline-block font-semibold text-pink-400">{line}</span> : line}
      </p>

      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        <Fingers count={fingers[me] ?? 0} label="You" tone="bg-green-500" />
        <Fingers count={fingers[partner] ?? 0} label={partnerName} tone="bg-pink-400" />
      </div>

      {phase === "revealing" && (
        <div className="flex flex-col items-center gap-1">
          {myNext ? (
            <p className="text-caption text-text-muted">Waiting for {partnerName}…</p>
          ) : (
            <button type="button" disabled={busy} onClick={() => act("next", {})} className="min-h-11 min-w-40 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white active:scale-[0.98]">
              {round >= rounds || Object.values(fingers).some((n) => n === 0) ? "See how it went" : "Next one"}
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
