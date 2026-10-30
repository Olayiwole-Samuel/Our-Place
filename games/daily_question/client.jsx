"use client";

import { m } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Daily Question — the in-room panel. Renders the server's view and sends
 * intents only: answer { text } · more · finish. Your partner's answer arrives
 * only once you've both answered; then the two answers open side by side.
 */
const MAX = 280;

function dayLabel(day) {
  try {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return day;
  }
}

export default function DailyQuestion({ view, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const live = status === "active" && view.phase !== "finished";
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [view.index]);
  const revealing = view.phase === "revealing" || (view.phase === "finished" && view.partnerAnswer);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">{view.index === 0 ? "Today's question 📅" : `Bonus question ${view.index} ✨`}</p>
        <p className="text-micro tracking-normal text-text-muted">{dayLabel(view.day)}</p>
      </div>

      <m.p
        key={view.question.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[var(--radius-md)] bg-[linear-gradient(135deg,#2b1530,#16202a)] px-4 py-4 text-center text-[1.05rem] leading-snug font-semibold text-white-soft"
      >
        {view.question.text}
      </m.p>

      {view.phase === "answering" && !view.myAnswer && live && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) act("answer", { text: draft.trim() });
          }}
        >
          <textarea
            value={draft}
            maxLength={MAX}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your answer — only shown when you've both answered"
            aria-label="Your answer"
            className="resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 py-2 text-body text-white-soft"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-micro tracking-normal text-text-muted">
              {view.partnerAnswered ? `${partnerName} has answered 👀` : `${MAX - draft.length} left`}
            </span>
            <button type="submit" disabled={!draft.trim() || busy} className="min-h-10 rounded-[var(--radius-md)] bg-green-600 px-5 text-caption font-semibold text-white disabled:opacity-50">
              Answer
            </button>
          </div>
        </form>
      )}

      {view.phase === "answering" && view.myAnswer && (
        <p role="status" className="text-center text-caption text-text-secondary">
          Answered ✓ — waiting for {partnerName}…
        </p>
      )}

      {revealing && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["You", view.myAnswer, "border-green-600/60"],
            [partnerName, view.partnerAnswer, "border-pink-400/60"],
          ].map(([who, text, border], i) => (
            <m.div key={who} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.15, type: "spring", stiffness: 260, damping: 20 }} className={`rounded-[var(--radius-md)] border ${border} bg-black-800 px-3 py-2`}>
              <p className="micro-caps mb-1 text-text-muted">{who}</p>
              <p className="text-body leading-snug break-words text-white-soft">{text}</p>
            </m.div>
          ))}
        </div>
      )}

      {view.phase === "revealing" && live && (
        <div className="flex items-center justify-center gap-2">
          {view.bonusLeft > 0 && (
            <button type="button" disabled={busy} onClick={() => act("more", {})} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 text-caption text-text-secondary hover:bg-black-700">
              Another one ✨
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => act("finish", {})} className="min-h-11 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white">
            Done for today
          </button>
        </div>
      )}
      {view.phase === "answering" && live && (
        <button type="button" onClick={() => act("finish", {})} disabled={busy} className="self-center text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Finish
        </button>
      )}
    </div>
  );
}
