"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/ui/sounds";

/**
 * Hangman — set a secret word for each other. Renders the server's view and
 * sends intents only: set { word, hint } · guess { letter } · solve { word } · next · finish.
 * The guesser's view never has the word (only the letters found); the drawing
 * grows one piece per miss, and found letters drop into place.
 */
const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function Gallows({ misses }) {
  const part = (n, el) => (misses >= n ? el : null);
  return (
    <svg viewBox="0 0 120 130" aria-label={`${misses} of 6 misses`} role="img" className="h-[clamp(5.5rem,24vmin,9rem)] w-auto shrink-0 text-text-secondary">
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none">
        <path d="M10 124 H80 M30 124 V8 H84 V22" />
      </g>
      <g stroke="#ff6b8b" strokeWidth="4" strokeLinecap="round" fill="none" className="hangman-part">
        {part(1, <circle key="h" cx="84" cy="34" r="12" />)}
        {part(2, <path key="b" d="M84 46 V82" />)}
        {part(3, <path key="la" d="M84 56 L68 70" />)}
        {part(4, <path key="ra" d="M84 56 L100 70" />)}
        {part(5, <path key="ll" d="M84 82 L70 104" />)}
        {part(6, <path key="rl" d="M84 82 L98 104" />)}
      </g>
    </svg>
  );
}

export default function Hangman({ view, me, partner, names = {}, status, busy, act }) {
  const partnerName = names[partner] ?? "Your partner";
  const live = status === "active";
  const iSet = view.setter === me;
  const guessing = live && view.phase === "guessing" && !iSet;
  const [word, setWord] = useState("");
  const [hint, setHint] = useState("");
  const [solve, setSolve] = useState("");

  const found = view.guessed.length;
  const lastFound = useRef(found);
  useEffect(() => {
    if (found > lastFound.current) playSound("move");
    lastFound.current = found;
  }, [found]);
  useEffect(() => {
    setWord("");
    setHint("");
    setSolve("");
  }, [view.round, view.phase]);

  // A refused intent (say, a word with digits) is explained by the game shell.
  const send = (type, payload) => act(type, payload);

  const status_ =
    view.phase === "setting"
      ? iSet
        ? `Round ${view.round}: choose a secret word for ${partnerName}`
        : `${partnerName} is choosing a word for you…`
      : view.phase === "guessing"
        ? iSet
          ? `${partnerName} is guessing your word…`
          : `Guess ${partnerName}'s word`
        : view.solved
          ? iSet
            ? `${partnerName} got it! (+${view.maxMisses + 1 - view.misses})`
            : `You got it! +${view.maxMisses + 1 - view.misses} 🎉`
          : iSet
            ? `${partnerName} was hanged — +3 for you 😈`
            : "Hanged! +3 for them 💀";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="micro-caps text-pink-400">Hangman</p>
        <p className="text-micro tracking-normal text-text-muted">
          You {view.scores[me] ?? 0} · {partnerName} {view.scores[partner] ?? 0} · Round {view.round} of {view.rounds}
        </p>
      </div>

      <p role="status" aria-live="polite" className={`text-center text-caption ${guessing || (view.phase === "setting" && iSet) ? "font-semibold text-green-500" : "text-text-secondary"}`}>
        {status_}
      </p>

      {view.phase === "setting" && iSet && live && (
        <form
          className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center"
          onSubmit={(event) => {
            event.preventDefault();
            send("set", { word, ...(hint.trim() ? { hint: hint.trim() } : {}) });
          }}
        >
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            value={word}
            onChange={(e) => setWord(e.target.value.replace(/[^a-zA-Z ]/g, ""))}
            placeholder="Secret word (hidden)"
            aria-label="Secret word"
            className="min-h-11 w-56 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-body text-white-soft"
          />
          <input
            maxLength={40}
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Hint (optional)"
            aria-label="Hint"
            className="min-h-11 w-56 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-body text-white-soft"
          />
          <button type="submit" disabled={busy || word.replace(/ /g, "").length < 3} className="min-h-11 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white disabled:opacity-50">
            Set it
          </button>
        </form>
      )}

      {view.pattern && (
        <div className="flex items-center justify-center gap-4">
          <Gallows misses={view.misses} />
          <div className="flex min-w-0 flex-col items-center gap-2">
            <p aria-label={view.word ? `The word: ${view.word}` : `The word so far: ${view.pattern.join("")}`} className="flex flex-wrap justify-center gap-[0.3em] font-mono text-[clamp(1.1rem,5vmin,2rem)] font-bold tracking-normal text-white-soft">
              {view.pattern.map((ch, i) =>
                ch === " " ? (
                  <span key={i} className="w-[0.5em]" />
                ) : (
                  <span key={`${i}-${ch}`} className={`grid w-[1em] place-items-center border-b-2 border-white/40 ${ch !== "_" ? "words-drop" : "text-transparent"} ${view.phase === "reveal" && !view.guessed.includes(ch) ? "text-pink-400" : ""}`}>
                    {ch === "_" ? "·" : ch.toUpperCase()}
                  </span>
                ),
              )}
            </p>
            {view.hint && <p className="text-micro tracking-normal text-text-secondary">Hint: {view.hint}</p>}
            <p className="text-micro tracking-normal text-text-muted">
              Misses {view.misses}/{view.maxMisses}
              {view.wrong.length ? ` · ${view.wrong.join(" ").toUpperCase()}` : ""}
            </p>
          </div>
        </div>
      )}

      {view.phase === "guessing" && !iSet && (
        <div className="flex flex-col items-center gap-1.5">
          {KEYS.map((row) => (
            <div key={row} className="flex gap-1">
              {[...row].map((letter) => {
                const used = view.guessed.includes(letter);
                const wrong = view.wrong.includes(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    disabled={!guessing || busy || used}
                    onClick={() => send("guess", { letter })}
                    aria-label={`Guess ${letter.toUpperCase()}`}
                    className={`grid h-[clamp(1.9rem,8vmin,2.5rem)] w-[clamp(1.5rem,6.5vmin,2.2rem)] place-items-center rounded-[var(--radius-sm)] text-caption font-semibold uppercase ${
                      used ? (wrong ? "bg-black-900 text-text-muted line-through" : "bg-green-700/50 text-white-soft") : "bg-black-700 text-white-soft hover:bg-black-600 active:scale-95"
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          ))}
          <form
            className="mt-1 flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (solve.trim()) send("solve", { word: solve });
            }}
          >
            <input value={solve} onChange={(e) => setSolve(e.target.value.replace(/[^a-zA-Z ]/g, ""))} maxLength={20} placeholder="Know it? Type it" aria-label="Solve" className="min-h-9 w-44 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft" />
            <button type="submit" disabled={!guessing || busy || !solve.trim()} className="min-h-9 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 text-caption text-text-secondary hover:bg-black-700 disabled:opacity-50">
              Solve
            </button>
          </form>
        </div>
      )}

      {view.phase === "reveal" && live && (
        <button type="button" disabled={busy} onClick={() => send("next", {})} className="min-h-11 min-w-40 self-center rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white">
          {view.round >= view.rounds ? "See who won" : "Next round"}
        </button>
      )}

      {live && (
        <button type="button" onClick={() => send("finish", {})} disabled={busy} className="self-center text-micro tracking-normal text-text-muted underline-offset-2 hover:text-text-secondary hover:underline">
          Finish game
        </button>
      )}
    </div>
  );
}
