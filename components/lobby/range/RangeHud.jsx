"use client";

import { AnimatePresence, m } from "motion/react";
import { Crosshair, LogOut, RotateCcw, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { ROUND_MS, multiplier } from "@/lib/range/targets";
import { timeLeft, useRangeStore } from "@/store/rangeStore";
import { useRoomStore } from "@/store/roomStore";

/**
 * The range's controls while you're at a lane: the rules and Start, a 3-2-1,
 * then score / streak / time along the top and a crosshair; the result at the
 * end (with a new best called out). Your partner's live score shows when
 * they're shooting too (a cosmetic hint over presence; scores are saved by
 * record_range_score).
 */
export function RangeHud({ runtime, partnerName }) {
  const lane = useRangeStore((state) => state.lane);
  usePartnerLive(runtime);
  return <AnimatePresence>{lane !== null && <Hud key="range" runtime={runtime} partnerName={partnerName} />}</AnimatePresence>;
}

/** Your partner's score while they shoot (and yours to them), at most once a second. */
function usePartnerLive(runtime) {
  useEffect(() => {
    if (!runtime) return undefined;
    const listeners = (runtime.hintListeners ??= new Set());
    let stale = null;
    const listener = (hint) => {
      if (!hint?.range) return;
      useRangeStore.getState().setPartnerLive({ score: Number(hint.range.score) || 0, phase: String(hint.range.phase ?? "") });
      clearTimeout(stale);
      stale = setTimeout(() => useRangeStore.getState().setPartnerLive(null), 4000);
    };
    listeners.add(listener);
    let last = 0;
    const stop = useRangeStore.subscribe((state) => {
      if (state.lane === null || Date.now() - last < 1000) return;
      last = Date.now();
      runtime.presence?.sendHint?.({ range: { score: state.score, phase: state.phase } });
    });
    return () => {
      listeners.delete(listener);
      stop();
      clearTimeout(stale);
    };
  }, [runtime]);
}

function Hud({ partnerName }) {
  const { lane, phase, score, hits, shots, streak, result, partnerLive } = useRangeStore();
  const range = useRoomStore((state) => state.range);
  const [now, setNow] = useState(() => Date.now());
  const [pointer, setPointer] = useState(null);

  useEffect(() => {
    if (phase !== "playing" && phase !== "countdown") return undefined;
    let frame;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // The crosshair follows a mouse; on touch it shows where you tapped.
  useEffect(() => {
    if (phase !== "playing") return undefined;
    const move = (event) => setPointer({ x: event.clientX, y: event.clientY, touch: event.pointerType === "touch", at: Date.now() });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
    };
  }, [phase]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && useRangeStore.getState().leave();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const left = timeLeft(useRangeStore.getState(), now);
  const seconds = Math.ceil(left / 1000);
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
  const store = useRangeStore.getState();
  const countdownAt = useRangeStore((state) => state.countdownAt);
  const countdown = phase === "countdown" && countdownAt ? Math.max(1, 3 - Math.floor((now - countdownAt) / 800)) : null;

  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="range-hud pointer-events-none absolute inset-0 z-40">
      {/* Top bar: score, streak, time. */}
      {(phase === "playing" || phase === "countdown") && (
        <div className="absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-4 py-1.5 text-white-soft shadow-lg short:top-14 short:py-1">
          <span className="text-caption">
            <span className="text-text-muted">Score </span>
            <span className="font-bold tabular-nums">{score}</span>
          </span>
          <span className={`text-caption font-bold tabular-nums ${multiplier(streak) > 1 ? "text-[#ffd23f]" : "text-text-muted"}`}>×{multiplier(streak)}</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
            <span className="block h-full bg-[#f2c94c] transition-[width] duration-200" style={{ width: `${(left / ROUND_MS) * 100}%` }} />
          </span>
          <span className={`w-7 text-right text-caption font-bold tabular-nums ${seconds <= 5 ? "text-pink-400" : ""}`}>{seconds}s</span>
          <span className="text-micro tracking-normal text-text-muted tabular-nums">
            {hits}/{shots}
          </span>
        </div>
      )}
      {partnerLive && (
        <p className="absolute top-[6.4rem] left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-0.5 text-micro tracking-normal text-pink-400 short:top-[5.3rem]">
          {partnerName}: {partnerLive.score} {partnerLive.phase === "playing" ? "· shooting now" : ""}
        </p>
      )}

      {countdown && (
        <m.p key={countdown} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 grid place-items-center text-[5rem] font-black text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] short:text-[3.5rem]">
          {countdown}
        </m.p>
      )}

      {phase === "playing" && pointer && (!pointer.touch || Date.now() - pointer.at < 260) && (
        <span aria-hidden="true" className="absolute -translate-x-1/2 -translate-y-1/2 text-[#ffd23f] drop-shadow-[0_0_4px_rgba(0,0,0,0.9)]" style={{ left: pointer.x, top: pointer.y }}>
          <Crosshair size={30} strokeWidth={2.2} />
        </span>
      )}

      {phase === "ready" && (
        <div className="absolute inset-0 grid place-items-center p-3">
          <section className="panel pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-[var(--radius-lg)] p-4 text-center short:gap-1.5 short:p-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#f2c94c] text-black-950 short:size-8">
              <Target aria-hidden="true" size={20} />
            </span>
            <h2 className="text-body font-semibold text-white-soft">Lane {lane + 1} · 45 seconds</h2>
            <p className="text-caption text-text-secondary">Tap the targets as they pop up. Bullseye 10 · middle 7 · edge 4. Gold ones are double. Hit 3 in a row for ×2, 6 for ×3 — a miss resets it.</p>
            <p className="text-micro tracking-normal text-text-muted">
              Your best {range?.myBest ?? 0} · {partnerName}&apos;s best {range?.partnerBest ?? 0}
            </p>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => store.begin()} className="min-h-11 rounded-[var(--radius-md)] bg-green-600 px-6 text-body font-semibold text-white">
                Start
              </button>
              <button type="button" onClick={() => store.leave()} className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-caption text-text-secondary hover:text-white-soft">
                <LogOut aria-hidden="true" size={14} /> Step away
              </button>
            </div>
          </section>
        </div>
      )}

      {phase === "done" && result && (
        <div className="absolute inset-0 grid place-items-center p-3">
          <m.section initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="panel pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-[var(--radius-lg)] p-4 text-center short:gap-1 short:p-3">
            {result.best && <p className="micro-caps text-[#ffd23f]">🎯 New best!</p>}
            <p className="text-[2.6rem] leading-none font-black text-white-soft tabular-nums short:text-[2rem]">{result.score}</p>
            <p className="text-caption text-text-secondary">
              {result.hits} hits · {accuracy}% accuracy · best streak {result.bestStreak}
            </p>
            <p className="text-micro tracking-normal text-text-muted">
              Your best {Math.max(range?.myBest ?? 0, result.score)} · {partnerName}&apos;s best {range?.partnerBest ?? 0}
            </p>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => store.begin()} className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] bg-green-600 px-5 text-body font-semibold text-white">
                <RotateCcw aria-hidden="true" size={15} /> Again
              </button>
              <button type="button" onClick={() => store.leave()} className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 text-caption text-white-soft">
                <LogOut aria-hidden="true" size={14} /> Step away
              </button>
            </div>
          </m.section>
        </div>
      )}

      {phase === "playing" && (
        <button type="button" onClick={() => store.leave()} className="pointer-events-auto absolute right-3 bottom-3 flex min-h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-micro tracking-normal text-white-soft short:right-2 short:bottom-2">
          <LogOut aria-hidden="true" size={13} /> Stop
        </button>
      )}
    </m.div>
  );
}
