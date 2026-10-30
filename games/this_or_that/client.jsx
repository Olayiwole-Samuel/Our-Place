"use client";

import { AnimatePresence, m } from "motion/react";

/**
 * This or That — the in-room panel: quick picks. Renders the server's view and
 * sends intents only (pick / finish). The pair you've both just picked shows
 * as a small reveal ("Same! 💞" or who picked what) while the next pair slides in.
 */
export default function ThisOrThat({ view, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { pair, myPick, partnerPicked, last, round, rounds, matched, played } = view;
  const live = status === "active" && !view.finished;
  const canPick = live && !myPick && !busy;
  const same = last && last.mine === last.theirs;

  const option = (letter, text) => {
    const mine = myPick === letter;
    return (
      <m.button
        type="button"
        aria-pressed={mine}
        aria-disabled={!canPick}
        onClick={() => canPick && act("pick", { choice: letter })}
        whileTap={canPick ? { scale: 0.95 } : undefined}
        className={`grid min-h-20 flex-1 place-items-center rounded-[var(--radius-md)] border px-3 text-center text-[1.05rem] font-semibold ${
          mine ? "border-green-500 bg-green-700/35 text-white-soft" : "border-[var(--border-subtle)] bg-black-800 text-white-soft"
        } ${canPick ? "cursor-pointer hover:bg-black-700" : "cursor-default"} ${myPick && !mine ? "opacity-50" : ""}`}
      >
        {text}
      </m.button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">This or that ⚡</p>
        <p className="text-micro tracking-normal text-text-muted">
          {played > 0 && <span className="mr-2 text-pink-400">💞 {matched}/{played} same</span>}
          {Math.min(round, rounds)} of {rounds}
        </p>
      </div>

      {pair && !view.finished && (
        <AnimatePresence mode="popLayout" initial={false}>
          <m.div key={pair.id} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.22 }} className="flex items-stretch gap-2">
            {option("A", pair.optionA)}
            <span aria-hidden="true" className="self-center text-micro font-semibold tracking-normal text-text-muted">or</span>
            {option("B", pair.optionB)}
          </m.div>
        </AnimatePresence>
      )}

      <p role="status" aria-live="polite" className="min-h-5 text-center text-caption text-text-secondary">
        {!live ? "" : myPick ? `Waiting for ${partnerName}…` : partnerPicked ? `${partnerName} picked — your turn!` : "Pick fast — don't overthink it!"}
      </p>

      {last && (
        <m.div key={last.number} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className={`self-center rounded-full px-4 py-1.5 text-caption ${same ? "bg-pink-500/20 text-pink-300" : "bg-black-800 text-text-secondary"}`}>
          {same ? (
            <>
              Same! 💞 Both: <b>{last.pair[`option${last.mine}`]}</b>
            </>
          ) : (
            <>
              You: <b>{last.pair[`option${last.mine}`]}</b> · {partnerName}: <b>{last.pair[`option${last.theirs}`]}</b>
            </>
          )}
        </m.div>
      )}

      {live && (
        <button type="button" onClick={() => act("finish", {})} disabled={busy} className="self-center text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Finish game
        </button>
      )}
    </div>
  );
}
