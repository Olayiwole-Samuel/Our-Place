"use client";

import { AnimatePresence, animate, m, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { anniversaryLabel, countdown, durationText, ordinal, togetherSince } from "@/lib/room/together";
import { useRoomStore } from "@/store/roomStore";

/**
 * "Us": the two of you, counted. A glowing heart that beats inside a ring that
 * fills through the year, days together counting up, a live "together for"
 * clock, rolling-digit countdowns to the next anniversary (and on to the next
 * year after each one) and the next monthsary, a year timeline — and on the
 * day itself, a celebration. Tap the heart for a burst of hearts.
 *
 * Purely visual: everything comes from couples.together_since (roomStore).
 * Respects reduced motion (CSS media query + MotionConfig reducedMotion="user").
 */
const HEART_PATH = "M12 21.3s-7.2-4.6-9.6-8.9C.7 9 2.3 4.9 6.1 4.2c2.3-.4 4.4.6 5.9 2.6 1.5-2 3.6-3 5.9-2.6 3.8.7 5.4 4.8 3.7 8.2-2.4 4.3-9.6 8.9-9.6 8.9z";

/** Re-renders every second, on the second. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** A tiny deterministic random, so the sky looks the same on every render. */
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/** Night sky: drifting aurora, twinkling stars, hearts rising slowly. */
function Sky() {
  const { stars, hearts } = useMemo(() => {
    const random = seeded(7);
    return {
      stars: Array.from({ length: 46 }, () => ({ left: random() * 100, top: random() * 100, size: 1 + random() * 2, delay: random() * 4, duration: 2.5 + random() * 3 })),
      hearts: Array.from({ length: 16 }, () => ({ left: random() * 100, size: 10 + random() * 18, delay: -random() * 14, duration: 9 + random() * 8, sway: 10 + random() * 26, hue: random() })),
    };
  }, []);
  return (
    <div aria-hidden="true" className="us-sky">
      <span className="us-aurora us-aurora-a" />
      <span className="us-aurora us-aurora-b" />
      <span className="us-aurora us-aurora-c" />
      {stars.map((star, i) => (
        <span key={`s${i}`} className="us-star" style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size, animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` }} />
      ))}
      {hearts.map((heart, i) => (
        <span
          key={`h${i}`}
          className="us-float-heart"
          style={{ left: `${heart.left}%`, fontSize: heart.size, animationDelay: `${heart.delay}s`, animationDuration: `${heart.duration}s`, "--sway": `${heart.sway}px`, color: heart.hue > 0.66 ? "#ff8fb1" : heart.hue > 0.33 ? "#ff5c8a" : "#ffc2d4" }}
        >
          ♥
        </span>
      ))}
    </div>
  );
}

/** Counts up from 0 the first time it shows. */
function CountUp({ value }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current || reduce) {
      setShown(value);
      return undefined;
    }
    first.current = false;
    const controls = animate(0, value, { duration: 1.8, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{shown.toLocaleString()}</>;
}

/** Digits that roll into place as they change. */
function Rolling({ value }) {
  return (
    <span className="us-rolling">
      {value.split("").map((digit, i) => (
        <span key={i} className="us-rolling-digit">
          <AnimatePresence initial={false} mode="popLayout">
            <m.span key={digit} initial={{ y: "-90%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "90%", opacity: 0 }} transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }} className="inline-block">
              {digit}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

const pad = (n, length = 2) => String(n).padStart(length, "0");

/** The beating heart, the year ring and the burst of hearts on tap. */
function HeartRing({ days, progress, onTap }) {
  const [bursts, setBursts] = useState([]);
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const tap = () => {
    const id = Date.now();
    const random = seeded(id % 2147483646 || 1);
    setBursts((list) => [...list.slice(-3), { id, pieces: Array.from({ length: 16 }, (_, i) => ({ angle: (i / 16) * Math.PI * 2 + random() * 0.4, distance: 70 + random() * 70, size: 12 + random() * 14, spin: (random() - 0.5) * 90 })) }]);
    setTimeout(() => setBursts((list) => list.filter((burst) => burst.id !== id)), 1400);
    try {
      navigator.vibrate?.(25);
    } catch {
      // not on this device
    }
    onTap?.();
  };
  return (
    <button type="button" onClick={tap} aria-label={`${days} days together — tap for hearts`} className="us-ring">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="us-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffd1e0" />
            <stop offset="55%" stopColor="#ff5c8a" />
            <stop offset="100%" stopColor="#c13584" />
          </linearGradient>
          <radialGradient id="us-heart-grad" cx="40%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffb3c8" />
            <stop offset="45%" stopColor="#ff4f7e" />
            <stop offset="100%" stopColor="#b8155a" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <m.circle cx="100" cy="100" r="92" fill="none" stroke="url(#us-ring-grad)" strokeWidth="5" strokeLinecap="round" transform="rotate(-90 100 100)" initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.004, progress) }} transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} className="us-ring-glow" />
        <m.g initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.2, type: "spring", stiffness: 260, damping: 14 }} style={{ transformOrigin: `${100 + 92 * Math.cos(angle)}px ${100 + 92 * Math.sin(angle)}px` }}>
          <circle cx={100 + 92 * Math.cos(angle)} cy={100 + 92 * Math.sin(angle)} r="7" fill="#fff" className="us-ring-dot" />
        </m.g>
      </svg>
      <span className="us-heart">
        <svg viewBox="0 0 24 24" className="size-full overflow-visible" aria-hidden="true">
          <path d={HEART_PATH} fill="url(#us-heart-grad)" />
          <path d="M5.6 6.1c-1.1.4-1.8 1.3-1.9 2.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" strokeLinecap="round" />
        </svg>
        <span className="us-heart-text">
          <span className="us-heart-days">
            <CountUp value={days} />
          </span>
          <span className="us-heart-label">days</span>
        </span>
      </span>
      {bursts.map((burst) => (
        <span key={burst.id} aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
          {burst.pieces.map((piece, i) => (
            <m.span
              key={i}
              className="absolute text-[#ff6b95]"
              style={{ fontSize: piece.size }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
              animate={{ x: Math.cos(piece.angle) * piece.distance, y: Math.sin(piece.angle) * piece.distance - 20, opacity: 0, scale: 1.1, rotate: piece.spin }}
              transition={{ duration: 1.2, ease: [0.2, 0.8, 0.3, 1] }}
            >
              ♥
            </m.span>
          ))}
        </span>
      ))}
    </button>
  );
}

/** Days · hours · minutes · seconds to `target`. */
function Countdown({ target, now, title, subtitle }) {
  const left = countdown(target, now);
  const parts = [
    [left.days > 99 ? pad(left.days, 3) : pad(left.days), left.days === 1 ? "day" : "days"],
    [pad(left.hours), "hours"],
    [pad(left.minutes), "mins"],
    [pad(left.seconds), "secs"],
  ];
  return (
    <section aria-label={`${title}: ${left.days} days, ${left.hours} hours, ${left.minutes} minutes left`} className="us-card">
      <p className="us-card-title">
        <span>{title}</span>
        <span className="us-card-sub">{subtitle}</span>
      </p>
      <div className="us-countdown" aria-hidden="true">
        {parts.map(([value, label], i) => (
          <span key={label} className="contents">
            {i > 0 && <span className="us-colon">:</span>}
            <span className="us-tile">
              <span className="us-tile-value">
                <Rolling value={value} />
              </span>
              <span className="us-tile-label">{label}</span>
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

const MONTHS_SHORT = (date) => date.toLocaleDateString(undefined, { month: "short" });

/** The year from one anniversary to the next, monthsaries marked, a heart where you are. */
function YearLine({ time }) {
  const ticks = Array.from({ length: 13 }, (_, i) => {
    const on = new Date(time.year.from.getFullYear(), time.year.from.getMonth() + i, Math.min(time.since.getDate(), 28));
    return { i, label: MONTHS_SHORT(on), reached: i <= time.months % 12 || (time.months % 12 === 0 && i === 0) };
  });
  return (
    <div className="us-yearline" aria-label={`${Math.round(time.year.progress * 100)}% of the way to your ${ordinal(time.year.number)} anniversary`}>
      <div className="us-yearline-track">
        <m.div className="us-yearline-fill" initial={{ width: 0 }} animate={{ width: `${time.year.progress * 100}%` }} transition={{ duration: 2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }} />
        {ticks.map((tick) => (
          <span key={tick.i} className={`us-yearline-tick ${tick.reached ? "is-reached" : ""} ${tick.i === 12 ? "is-goal" : ""}`} style={{ left: `${(tick.i / 12) * 100}%` }} />
        ))}
        <m.span className="us-yearline-heart" initial={{ left: 0, opacity: 0 }} animate={{ left: `${time.year.progress * 100}%`, opacity: 1 }} transition={{ duration: 2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}>
          ♥
        </m.span>
      </div>
      <div className="us-yearline-labels" aria-hidden="true">
        {ticks
          .filter((tick) => tick.i % 3 === 0)
          .map((tick) => (
            <span key={tick.i} style={{ left: `${(tick.i / 12) * 100}%` }}>
              {tick.i === 12 ? "💍" : tick.label}
            </span>
          ))}
      </div>
    </div>
  );
}

/** Falling hearts and a message — on the day itself. */
function Celebration({ title, line, big, onClose }) {
  const pieces = useMemo(() => {
    const random = seeded(big ? 11 : 5);
    return Array.from({ length: big ? 70 : 40 }, () => ({ left: random() * 100, delay: random() * 3.5, duration: 3.2 + random() * 3, size: 10 + random() * 16, spin: (random() - 0.5) * 720, kind: random(), drift: (random() - 0.5) * 120 }));
  }, [big]);
  const [raining, setRaining] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setRaining(false), 9000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <m.div className="us-celebrate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      {raining && (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          {pieces.map((piece, i) => (
            <span
              key={i}
              className="us-confetti"
              style={{ left: `${piece.left}%`, fontSize: piece.size, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, "--spin": `${piece.spin}deg`, "--drift": `${piece.drift}px`, color: piece.kind > 0.75 ? "#ffd166" : piece.kind > 0.5 ? "#ffffff" : piece.kind > 0.25 ? "#ff8fb1" : "#ff4f7e" }}
            >
              {piece.kind > 0.75 ? "✦" : "♥"}
            </span>
          ))}
        </div>
      )}
      <m.div role="status" className="us-celebrate-card" initial={{ scale: 0.6, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 180, damping: 13, delay: 0.25 }}>
        <span aria-hidden="true" className="us-celebrate-emoji">
          {big ? "💍" : "💗"}
        </span>
        <p className="us-celebrate-title">{title}</p>
        <p className="us-celebrate-line">{line}</p>
        <span className="us-celebrate-hint">tap to continue</span>
      </m.div>
    </m.div>
  );
}

const fullDate = (date) => date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export function UsPanel({ myName, partnerName }) {
  const since = useRoomStore((state) => state.togetherSince);
  const now = useNow();
  const time = useMemo(() => (since ? togetherSince(since, now) : null), [since, now]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !event.defaultPrevented && useRoomStore.getState().closePanel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const special = time && (time.today.anniversary || time.today.monthsary);
  const clock = `${pad(now.getHours())}h ${pad(now.getMinutes())}m ${pad(now.getSeconds())}s`;

  return (
    <m.div role="dialog" aria-modal="false" aria-label="Us" className="us-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }} transition={{ duration: 0.5 }}>
      <Sky />
      <button type="button" aria-label="Close" onClick={() => useRoomStore.getState().closePanel()} className="us-close">
        <X aria-hidden="true" size={18} />
      </button>

      {!time ? (
        <p className="relative z-10 m-auto text-caption text-white-soft/70">Counting our days…</p>
      ) : (
        <div className="us-layout">
          <m.section className="us-left" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
            <HeartRing days={time.days} progress={time.year.progress} />
            <p className="us-names">
              <span>{myName}</span>
              <span aria-hidden="true" className="us-names-heart">
                ♥
              </span>
              <span>{partnerName}</span>
            </p>
          </m.section>

          <m.section className="us-right" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.12, delayChildren: 0.35 } } }}>
            <m.p variants={rise} className="us-eyebrow">
              Together since {fullDate(time.since)}
            </m.p>
            <m.p variants={rise} className="us-together">
              {durationText(time)} <span className="us-together-clock">{clock}</span>
            </m.p>
            <m.p variants={rise} className="us-seconds">
              <Rolling value={time.seconds.toLocaleString()} /> seconds of us ✨
            </m.p>
            <m.div variants={rise}>
              <Countdown target={time.year.on} now={now} title={`Our ${anniversaryLabel(time.year.number * 12)}`} subtitle={time.year.on.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} />
            </m.div>
            <m.div variants={rise}>
              <YearLine time={time} />
            </m.div>
            <m.p variants={rise} className="us-next">
              <span aria-hidden="true">💗</span>
              {time.next.months % 12 === 0 ? (
                <span>Next: your {ordinal(time.next.months / 12)} anniversary</span>
              ) : (
                <span>
                  {time.next.months}-month anniversary {time.next.inDays === 1 ? "tomorrow" : `in ${time.next.inDays} days`} · {time.next.on.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
              )}
            </m.p>
          </m.section>
        </div>
      )}

      <AnimatePresence>
        {special && !dismissed && (
          <Celebration
            key="celebrate"
            big={Boolean(time.today.anniversary)}
            title={time.today.anniversary ? `Happy ${ordinal(time.today.anniversary)} anniversary!` : `Happy ${time.today.monthsary} month${time.today.monthsary === 1 ? "" : "s"}!`}
            line={time.today.anniversary ? `${time.today.anniversary === 1 ? "One whole year" : `${time.today.anniversary} whole years`} of ${myName} & ${partnerName} 💞` : `${time.days.toLocaleString()} days of ${myName} & ${partnerName}, and counting`}
            onClose={() => setDismissed(true)}
          />
        )}
      </AnimatePresence>
    </m.div>
  );
}

const rise = { hidden: { opacity: 0, y: 14 }, shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } };

/** Today is a monthsary or an anniversary? (for opening "Us" once on the day) */
export function specialDay(since, now = new Date()) {
  if (!since) return null;
  const { today } = togetherSince(since, now);
  return today.monthsary ? `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}` : null;
}
