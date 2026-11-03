"use client";

import { useEffect, useRef, useState } from "react";
import { useCountdown } from "@/games/shared/useCountdown";
import { playSound } from "@/lib/ui/sounds";
import { MAX_WORD, ROUND_MS } from "./rules";

/**
 * Category Blitz — the in-room panel. Renders the server's view and sends
 * intents only (add / time_up / strike / done). While you play, your partner
 * only sees how many you've got; the lists open when time's up.
 */
export default function CategoryBlitz({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const { phase, category, mine, theirs, theirCount, myDone, partnerDone, scores, round, rounds, deadline } = view;
  const live = status === "active";
  const playing = live && phase === "playing";
  const left = useCountdown(deadline, { active: playing, onEnd: () => act("time_up", {}) });
  const [word, setWord] = useState("");
  const input = useRef(null);
  useEffect(() => setWord(""), [round]);
  useEffect(() => {
    if (playing) input.current?.focus({ preventScroll: true });
  }, [playing, round]);

  const count = useRef(mine.length);
  useEffect(() => {
    if (mine.length > count.current) playSound("move");
    count.current = mine.length;
  }, [mine.length]);

  const submit = (event) => {
    event.preventDefault();
    const text = word.trim();
    if (!text || busy) return;
    act("add", { word: text });
    setWord("");
    input.current?.focus({ preventScroll: true });
  };

  const standing = (list) => list.filter((entry) => !entry.struck).length;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">Category blitz ⏱️</p>
        <p className="text-micro tracking-normal text-text-muted">
          <span className="mr-2 font-semibold text-white-soft">
            You {scores[me] ?? 0} · {partnerName} {scores[partner] ?? 0}
          </span>
          Round {round} of {rounds}
        </p>
      </div>

      <p className="rounded-[var(--radius-md)] bg-[linear-gradient(135deg,#2b1530,#1f2a44)] px-4 py-3 text-center text-[1.1rem] font-bold text-white-soft">{category.text}</p>

      {playing && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black-700" role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
              <div className={`h-full rounded-full transition-[width] duration-200 ease-linear ${left < 10 ? "bg-pink-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, (left * 100_000) / ROUND_MS)}%` }} />
            </div>
            <span className={`w-8 text-right text-caption font-semibold tabular-nums ${left < 10 ? "text-pink-400" : "text-white-soft"}`}>{Math.ceil(left)}s</span>
          </div>
          <form className="flex gap-2" onSubmit={submit}>
            <input ref={input} value={word} maxLength={MAX_WORD} onChange={(e) => setWord(e.target.value)} placeholder="Type one and press Enter" aria-label="Your answer" autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-body text-white-soft" />
            <button type="submit" disabled={!word.trim()} className="min-h-11 shrink-0 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white disabled:opacity-50">
              Add
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5" aria-label="Your answers">
            {mine.map((entry) => (
              <span key={entry.word} className="words-drop rounded-full bg-green-700/35 px-2.5 py-0.5 text-micro tracking-normal text-white-soft">
                {entry.word}
              </span>
            ))}
          </div>
          <p role="status" className="text-center text-micro tracking-normal text-text-muted">
            You: {mine.length} · {partnerName}: {theirCount} ✍️
          </p>
        </>
      )}

      {!playing && theirs && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[var(--radius-md)] border border-green-600/50 bg-black-800 p-2.5">
              <p className="micro-caps mb-1.5 text-text-muted">You · {standing(mine)}</p>
              <div className="flex flex-wrap gap-1">
                {mine.length === 0 && <span className="text-micro tracking-normal text-text-muted">Nothing this round 😅</span>}
                {mine.map((entry) => (
                  <span key={entry.word} className={`rounded-full px-2 py-0.5 text-micro tracking-normal ${entry.struck ? "bg-black-700 text-text-muted line-through" : "bg-green-700/35 text-white-soft"}`}>
                    {entry.word}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-[var(--radius-md)] border border-pink-400/50 bg-black-800 p-2.5">
              <p className="micro-caps mb-1.5 text-text-muted">{partnerName} · {standing(theirs)}</p>
              <div className="flex flex-wrap gap-1">
                {theirs.length === 0 && <span className="text-micro tracking-normal text-text-muted">Nothing this round 😅</span>}
                {theirs.map((entry, index) => (
                  <button
                    key={entry.word}
                    type="button"
                    disabled={!live || myDone || busy}
                    aria-pressed={entry.struck}
                    aria-label={`${entry.word}: ${entry.struck ? "struck out — tap to allow" : "tap to strike out"}`}
                    onClick={() => act("strike", { index })}
                    className={`rounded-full px-2 py-0.5 text-micro tracking-normal ${entry.struck ? "bg-black-700 text-text-muted line-through" : "bg-pink-500/25 text-white-soft hover:bg-pink-500/40"}`}
                  >
                    {entry.word}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {live && (
            <>
              <p className="text-center text-micro tracking-normal text-text-secondary">Tap any of {partnerName}&apos;s answers that don&apos;t count, then tap Done.</p>
              {myDone ? (
                <p role="status" className="text-center text-caption text-text-muted">
                  Waiting for {partnerName}…
                </p>
              ) : (
                <button type="button" disabled={busy} onClick={() => act("done", {})} className="min-h-11 min-w-40 self-center rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white">
                  {round >= rounds ? "Done — see who won" : "Done — next category"}
                </button>
              )}
              {partnerDone && !myDone && <p className="text-center text-micro tracking-normal text-text-muted">{partnerName} is done</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
