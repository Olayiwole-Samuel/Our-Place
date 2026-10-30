"use client";

import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";

/**
 * Story Builder — the in-room panel. Renders the server's view and sends
 * intents only: add { text } · end · finish. The story reads like a page:
 * the opening line, then your lines (green) and your partner's (pink), each
 * new one fading in; the page scrolls to the newest line.
 */
const MAX = 160;

export default function StoryBuilder({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const live = status === "active" && !view.ended;
  const myTurn = live && view.current === me;
  const [draft, setDraft] = useState("");
  const page = useRef(null);
  const count = view.lines.length;

  const seen = useRef(count);
  useEffect(() => {
    page.current?.scrollTo({ top: page.current.scrollHeight, behavior: "smooth" });
    if (count > seen.current) playSound("move");
    seen.current = count;
  }, [count]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">Story builder 📖</p>
        <p className="text-micro tracking-normal text-text-muted">
          Line {Math.min(count + 1, view.maxLines)} of {view.maxLines}
        </p>
      </div>

      <div ref={page} className="max-h-[clamp(8rem,38vh,18rem)] overflow-y-auto rounded-[var(--radius-md)] bg-[#f3ead8] px-4 py-3 font-serif text-[0.98rem] leading-relaxed text-[#2b2118] shadow-inner">
        <p className="italic">{view.opening.text}</p>
        {view.lines.map((line, i) => (
          <m.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className={`mt-1 block ${line.by === me ? "text-[#2f6b2a]" : "text-[#9b2c55]"}`}>
            {line.text}
          </m.span>
        ))}
        {view.ended && <p className="mt-2 text-center font-semibold">— The end —</p>}
      </div>

      <p className="flex justify-center gap-3 text-micro tracking-normal text-text-muted">
        <span className="text-green-500">● You</span>
        <span className="text-pink-400">● {partnerName}</span>
      </p>

      {live && (
        <p role="status" aria-live="polite" className={`text-center text-caption ${myTurn ? "font-semibold text-green-500" : "text-text-secondary"}`}>
          {myTurn ? "Your line — what happens next?" : `${partnerName} is writing the next line…`}
        </p>
      )}

      {myTurn && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim().length < 2) return;
            act("add", { text: draft.trim() });
            setDraft("");
          }}
        >
          <input value={draft} maxLength={MAX} onChange={(e) => setDraft(e.target.value)} placeholder="And then…" aria-label="Your line" className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-body text-white-soft" />
          <button type="submit" disabled={busy || draft.trim().length < 2} className="min-h-11 shrink-0 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      {live && (
        <div className="flex items-center justify-center gap-4">
          {count >= view.minLines && (
            <button type="button" disabled={busy} onClick={() => act("end", {})} className="min-h-9 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 text-micro tracking-normal text-text-secondary hover:bg-black-700">
              Write “The end”
            </button>
          )}
          <button type="button" onClick={() => act("finish", {})} disabled={busy} className="text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
            Finish game
          </button>
        </div>
      )}
    </div>
  );
}
