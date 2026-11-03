"use client";

import { m } from "motion/react";
import { useEffect, useState } from "react";
import { MAX_ANSWER } from "./revealRules";

/**
 * The panel for "write in secret, reveal together" (games/shared/revealRules.js).
 * Renders the server's view and sends intents only. Your partner's words arrive
 * only once you've both answered, and then the two answers open side by side.
 */
export function RevealGame({ title, placeholder, view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { mode, phase, prompt, round, rounds, myAnswer, partnerAnswered, partnerAnswer, verdict, myNext, partnerNext, scores } = view;
  const live = status === "active" && phase !== "finished";
  const iAmSubject = mode === "subject" && view.subject === me;
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [round]);
  const revealing = phase === "revealing" || (phase === "finished" && myAnswer !== null && partnerAnswer !== null);
  if (!prompt) return <p className="py-8 text-center text-caption text-text-muted">Setting up your game…</p>;

  const hint =
    mode === "subject"
      ? iAmSubject
        ? "About you — write the true answer"
        : `About ${partnerName} — what would they say?`
      : mode === "match"
        ? "Write what you remember"
        : "Finish it in your own words";
  const canNext = mode === "hearts" || verdict !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">{title}</p>
        <p className="text-micro tracking-normal text-text-muted">
          {mode === "subject" && (
            <span className="mr-2 text-pink-400">
              You {scores[me] ?? 0} · {partnerName} {scores[partner] ?? 0}
            </span>
          )}
          {mode === "match" && view.played > 0 && (
            <span className="mr-2 text-pink-400">
              💞 {view.matched}/{view.played}
            </span>
          )}
          Round {round} of {rounds}
        </p>
      </div>

      <m.p key={prompt.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[var(--radius-md)] bg-[linear-gradient(135deg,#2b1530,#16202a)] px-4 py-4 text-center text-[1.02rem] leading-snug font-semibold text-white-soft">
        {prompt.text}
      </m.p>

      {phase === "answering" && !myAnswer && live && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) act("answer", { text: draft.trim() });
          }}
        >
          <p className="text-center text-micro tracking-normal text-text-secondary">{hint}</p>
          <div className="flex gap-2">
            <input value={draft} maxLength={MAX_ANSWER} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label="Your answer" className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-body text-white-soft" />
            <button type="submit" disabled={busy || !draft.trim()} className="min-h-11 shrink-0 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white disabled:opacity-50">
              Send
            </button>
          </div>
          {partnerAnswered && <p className="text-center text-micro tracking-normal text-text-muted">{partnerName} has answered 👀</p>}
        </form>
      )}

      {phase === "answering" && myAnswer && (
        <p role="status" className="text-center text-caption text-text-secondary">
          Sent ✓ — waiting for {partnerName}…
        </p>
      )}

      {revealing && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["You", myAnswer, "border-green-600/60", me],
            [partnerName, partnerAnswer, "border-pink-400/60", partner],
          ].map(([who, text, border, id], i) => (
            <m.div key={who} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.15, type: "spring", stiffness: 260, damping: 20 }} className={`relative rounded-[var(--radius-md)] border ${border} bg-black-800 px-3 py-2`}>
              <p className="micro-caps mb-1 text-text-muted">
                {who}
                {mode === "subject" ? (view.subject === id ? " · the real answer" : " · the guess") : ""}
              </p>
              <p className="text-body leading-snug break-words text-white-soft">{text}</p>
              {mode === "hearts" && id === partner && (
                <button type="button" disabled={busy || view.myHeart || !live} aria-label={`Send a heart for ${partnerName}'s answer`} aria-pressed={view.myHeart} onClick={() => act("heart", {})} className={`absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full text-[1rem] ${view.myHeart ? "bg-pink-500/30" : "bg-black-700 hover:bg-black-600"}`}>
                  {view.myHeart ? "❤️" : "🤍"}
                </button>
              )}
              {mode === "hearts" && id === me && view.partnerHeart && (
                <span aria-label={`${partnerName} loved your answer`} className="wyr-reveal absolute top-1.5 right-2 text-[1rem]">
                  ❤️
                </span>
              )}
            </m.div>
          ))}
        </div>
      )}

      {phase === "revealing" && live && mode !== "hearts" && verdict === null && (
        <div className="flex flex-col items-center gap-1.5">
          {mode === "subject" && !iAmSubject ? (
            <p className="text-caption text-text-secondary">{partnerName} is checking your guess…</p>
          ) : (
            <>
              <p className="text-caption text-text-secondary">{mode === "subject" ? "Did they get it?" : "Did you match?"}</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => act("match", { same: true })} className="min-h-11 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white">
                  {mode === "subject" ? "Got it ✓" : "We match 💞"}
                </button>
                <button type="button" disabled={busy} onClick={() => act("match", { same: false })} className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 text-caption text-text-secondary hover:bg-black-700">
                  {mode === "subject" ? "Not quite ✗" : "Not quite 😅"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {phase === "revealing" && verdict !== null && mode !== "hearts" && (
        <p role="status" className={`wyr-reveal text-center text-caption font-semibold ${verdict ? "text-pink-400" : "text-text-secondary"}`}>
          {verdict ? (mode === "subject" ? (iAmSubject ? `${partnerName} knows you 💞` : "You got it! +1 💞") : "You matched 💞") : mode === "subject" ? (iAmSubject ? "Not this time 😄" : "Not quite 😅") : "Not quite — tell the story 😄"}
        </p>
      )}

      {phase === "revealing" && live && canNext && (
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
