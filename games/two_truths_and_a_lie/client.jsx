"use client";

import { m } from "motion/react";
import { useEffect, useState } from "react";
import { MAX_STATEMENT } from "./rules";

/**
 * Two Truths and a Lie — the in-room panel. Renders the server's view and
 * sends intents only: write { statements, lie } · guess { index } · next · finish.
 * The guesser's view never marks the lie until the reveal.
 */
export default function TwoTruthsAndALie({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const live = status === "active";
  const iTell = view.teller === me;
  const [drafts, setDrafts] = useState(["", "", ""]);
  const [lie, setLie] = useState(null);

  useEffect(() => {
    setDrafts(["", "", ""]);
    setLie(null);
  }, [view.round]);

  const ready = drafts.every((d) => d.trim().length >= 2) && lie !== null;
  const revealed = view.phase === "reveal" || view.phase === "finished";
  const right = view.guess !== null && view.guess === view.lie;

  const line =
    view.phase === "writing"
      ? iTell
        ? "Write two truths and one lie — then tap the lie"
        : `${partnerName} is writing two truths and a lie…`
      : view.phase === "guessing"
        ? iTell
          ? `${partnerName} is deciding which one is the lie… 👀`
          : "Which one is the lie?"
        : view.phase === "reveal"
          ? iTell
            ? right
              ? `${partnerName} caught you! 🕵️`
              : `You fooled ${partnerName}! 😏`
            : right
              ? "You caught the lie! 🕵️"
              : `${partnerName} fooled you! 😅`
          : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">Two truths and a lie 🤥</p>
        <p className="text-micro tracking-normal text-text-muted">
          Round {view.round} of {view.rounds} · {iTell ? "you tell" : `${partnerName} tells`}
        </p>
      </div>

      <p role="status" aria-live="polite" className={`text-center text-caption ${(view.phase === "writing" && iTell) || (view.phase === "guessing" && !iTell) ? "font-semibold text-green-500" : "text-text-secondary"}`}>
        {revealed ? <span key={`r-${view.round}`} className="wyr-reveal inline-block font-semibold text-pink-400">{line}</span> : line}
      </p>

      {view.phase === "writing" && iTell && live && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) act("write", { statements: drafts.map((d) => d.trim()), lie });
          }}
        >
          {drafts.map((draft, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={draft}
                maxLength={MAX_STATEMENT}
                onChange={(e) => setDrafts((list) => list.map((d, k) => (k === i ? e.target.value : d)))}
                placeholder={["Something about me…", "Something else…", "And one more…"][i]}
                aria-label={`Statement ${i + 1}`}
                className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft"
              />
              <button
                type="button"
                aria-pressed={lie === i}
                onClick={() => setLie(i)}
                className={`min-h-10 shrink-0 rounded-[var(--radius-md)] px-3 text-micro font-semibold tracking-normal ${lie === i ? "bg-pink-500 text-black-950" : "border border-[var(--border-subtle)] text-text-secondary hover:bg-black-700"}`}
              >
                {lie === i ? "The lie 🤥" : "Lie?"}
              </button>
            </div>
          ))}
          <button type="submit" disabled={!ready || busy} className="min-h-11 self-center rounded-[var(--radius-md)] bg-green-600 px-6 text-body font-semibold text-white disabled:opacity-50">
            Send to {partnerName}
          </button>
        </form>
      )}

      {view.statements && (
        <div className="flex flex-col gap-2">
          {view.statements.map((text, i) => {
            const isLie = revealed && view.lie === i;
            const picked = view.guess === i;
            const canGuess = live && view.phase === "guessing" && !iTell && !busy;
            const tellerMark = iTell && !revealed && view.lie === i;
            return (
              <m.button
                key={`${view.round}-${i}`}
                type="button"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                aria-disabled={!canGuess}
                onClick={() => canGuess && act("guess", { index: i })}
                className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left ${
                  isLie ? "border-pink-400 bg-pink-500/15" : revealed ? "border-green-600/50 bg-green-700/15" : "border-[var(--border-subtle)] bg-black-800"
                } ${canGuess ? "cursor-pointer hover:bg-black-700" : "cursor-default"}`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-black-700 text-micro font-semibold tracking-normal text-text-secondary">{i + 1}</span>
                <span className="flex-1 text-body leading-snug text-white-soft">{text}</span>
                {revealed && <span className="wyr-reveal text-micro font-semibold tracking-normal">{isLie ? "🤥 LIE" : "✓ true"}</span>}
                {picked && revealed && <span className="text-micro tracking-normal text-text-muted">{iTell ? `${partnerName}'s pick` : "your pick"}</span>}
                {tellerMark && <span className="text-micro tracking-normal text-pink-400">your lie</span>}
              </m.button>
            );
          })}
        </div>
      )}

      <p className="text-center text-micro tracking-normal text-text-muted">
        Lies spotted — you {view.caught[me] ?? 0} · {partnerName} {view.caught[partner] ?? 0}
      </p>

      {view.phase === "reveal" && live && (
        <button type="button" disabled={busy} onClick={() => act("next", {})} className="min-h-11 min-w-40 self-center rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white">
          {view.round >= view.rounds ? "See how it went" : "Next round"}
        </button>
      )}
      {live && view.phase !== "finished" && (
        <button type="button" onClick={() => act("finish", {})} disabled={busy} className="self-center text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Finish game
        </button>
      )}
    </div>
  );
}
