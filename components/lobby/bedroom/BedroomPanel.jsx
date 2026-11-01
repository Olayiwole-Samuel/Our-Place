"use client";

import { Moon, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SLEEP_SOUNDS, SLEEP_TIMERS } from "@/lib/bedroom/sounds";
import { STAR_MS, goodnightTonight, nightOf, skyAt, sleepSoundNow } from "@/lib/bedroom/night";
import { useBedroomStore } from "@/store/bedroomStore";
import { useRoomStore } from "@/store/roomStore";
import { RoomPanel } from "../room/RoomPanel";

/**
 * The bedroom panel (the nightstands, the window, or the buttons while you
 * lie on the bed): Goodnight · Sleep sounds · The sky & the wish jar.
 */
const TABS = [
  { id: "goodnight", label: "Goodnight", Icon: Moon },
  { id: "sounds", label: "Sleep sounds", Icon: Volume2 },
  { id: "sky", label: "The sky", Icon: Sparkles },
];

export function BedroomPanel({ me, partner, partnerName }) {
  const tab = useBedroomStore((state) => state.tab);
  const available = useBedroomStore((state) => state.available);
  return (
    <RoomPanel title="Bedroom 🌙" icon={<Moon size={16} />} wide>
      {!available ? (
        <p className="p-6 text-center text-caption text-text-secondary">The bedroom needs a quick update on the server first (the bedroom migration).</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <nav className="flex shrink-0 gap-1 border-b border-[var(--border-subtle)] px-2 py-1.5" aria-label="Bedroom">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => useBedroomStore.getState().setTab(id)}
                className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-micro font-semibold tracking-normal ${tab === id ? "bg-white-soft text-black-950" : "text-text-secondary hover:bg-black-700"}`}
              >
                <Icon aria-hidden="true" size={13} /> {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            {tab === "goodnight" && <Goodnight me={me} partner={partner} partnerName={partnerName} />}
            {tab === "sounds" && <SleepSounds />}
            {tab === "sky" && <Sky me={me} partnerName={partnerName} />}
          </div>
        </div>
      )}
    </RoomPanel>
  );
}

const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// ── Goodnight ──────────────────────────────────────────────────────────────
function Goodnight({ me, partner, partnerName }) {
  const goodnights = useBedroomStore((state) => state.goodnights);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const tonight = goodnightTonight(goodnights, { me, partner });
  // The last seven nights: who said it first.
  const record = useMemo(() => {
    const nights = [...new Set(goodnights.map((g) => g.night))].filter((night) => night !== nightOf(Date.now())).slice(0, 7);
    let mine = 0;
    let theirs = 0;
    for (const night of nights) {
      const a = goodnights.find((g) => g.night === night && g.userId === me);
      const b = goodnights.find((g) => g.night === night && g.userId === partner);
      if (a && (!b || Date.parse(a.saidAt) <= Date.parse(b.saidAt))) mine += 1;
      else if (b) theirs += 1;
    }
    return { nights: nights.length, mine, theirs };
  }, [goodnights, me, partner]);

  const say = async (event) => {
    event.preventDefault();
    setBusy(true);
    await useBedroomStore.getState().sayGoodnight(note);
    setBusy(false);
    setNote("");
  };

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="bedroom-moon grid size-20 place-items-center rounded-full bg-[radial-gradient(circle_at_40%_35%,#fff6d8,#f2d58a_60%,#c9a24f)] text-[2rem] shadow-[0_0_40px_rgba(255,230,160,0.35)]">🌙</div>
      {tonight.both ? (
        <p className="text-body font-semibold text-white-soft">
          Goodnight, you two 💞
          <span className="block text-caption font-normal text-text-secondary">{tonight.first === me ? "You" : partnerName} said it first tonight.</span>
        </p>
      ) : tonight.mine ? (
        <p className="text-body text-white-soft">
          You said goodnight at {time(tonight.mine.saidAt)} 💤
          <span className="block text-caption text-text-secondary">Waiting for {partnerName} to say it back…</span>
        </p>
      ) : tonight.theirs ? (
        <p className="text-body text-white-soft">
          {partnerName} said goodnight first at {time(tonight.theirs.saidAt)} 💤
          <span className="block text-caption text-text-secondary">Say it back?</span>
        </p>
      ) : (
        <p className="text-body text-white-soft">Ready for bed? Say goodnight — the lamps go down and the stars come out.</p>
      )}

      {[tonight.theirs, tonight.mine].filter((g) => g?.note).map((g) => (
        <p key={g.userId} className={`max-w-sm rounded-[var(--radius-md)] px-4 py-2 text-caption italic ${g.userId === me ? "bg-green-700/25 text-white-soft" : "bg-pink-500/15 text-white-soft"}`}>
          “{g.note}” <span className="not-italic text-text-muted">— {g.userId === me ? "you" : partnerName}</span>
        </p>
      ))}

      <form onSubmit={say} className="flex w-full max-w-sm flex-col gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={tonight.mine ? "Change your goodnight note…" : "A little note (optional) — “sweet dreams, baby”"} aria-label="Goodnight note" className="min-h-10 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft" />
        <button type="submit" disabled={busy || (tonight.mine && !note.trim())} className="min-h-11 rounded-full bg-[#5b4bb7] px-5 text-body font-semibold text-white disabled:opacity-50">
          {tonight.mine ? "Update my note" : "Goodnight 🌙"}
        </button>
      </form>

      {record.nights > 0 && (
        <p className="text-micro tracking-normal text-text-muted">
          Last {record.nights} night{record.nights === 1 ? "" : "s"}: you said it first {record.mine}×, {partnerName} {record.theirs}×
        </p>
      )}
    </div>
  );
}

// ── Sleep sounds ──────────────────────────────────────────────────────────
function SleepSounds() {
  const sleep = useBedroomStore((state) => state.sleep);
  const volume = useBedroomStore((state) => state.soundVolume);
  const [minutes, setMinutes] = useState(30);
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, []);
  const now = sleepSoundNow(sleep);
  const store = useBedroomStore.getState();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-secondary">Pick a sound — it plays on both your phones, softly, until the timer runs out. Lovely while you fall asleep on a call.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SLEEP_SOUNDS.map((sound) => {
          const playing = now.on && sleep?.sound === sound.id;
          return (
            <button
              key={sound.id}
              type="button"
              aria-pressed={playing}
              onClick={() => (playing ? store.setSleepSound(null) : store.setSleepSound(sound.id, minutes))}
              className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border ${playing ? "border-[#8f7dff] bg-[#5b4bb7]/35" : "border-[var(--border-subtle)] bg-black-800 hover:bg-black-700"}`}
            >
              <span aria-hidden="true" className="text-[1.5rem]">
                {sound.emoji}
              </span>
              <span className="text-micro font-semibold tracking-normal text-white-soft">{sound.label}</span>
              {playing && <span className="text-[0.62rem] text-[#c7bfff]">playing · tap to stop</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-micro tracking-normal text-text-muted">Sleep timer:</span>
        {SLEEP_TIMERS.map((value) => (
          <button
            key={value ?? "off"}
            type="button"
            aria-pressed={minutes === value}
            onClick={() => {
              setMinutes(value);
              if (now.on) store.setSleepSound(sleep.sound, value);
            }}
            className={`min-h-8 rounded-full px-3 text-micro tracking-normal ${minutes === value ? "bg-white-soft text-black-950" : "border border-[var(--border-subtle)] text-text-secondary hover:bg-black-700"}`}
          >
            {value ? (value >= 60 ? `${value / 60} h` : `${value} min`) : "No timer"}
          </button>
        ))}
      </div>
      {now.on && <p className="text-micro tracking-normal text-[#c7bfff]">{Number.isFinite(now.left) ? `Stops in ${Math.max(1, Math.round(now.left / 60_000))} min` : "Plays until you stop it"}</p>}
      <label className="flex items-center gap-3 text-micro tracking-normal text-text-secondary">
        Volume on this phone
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => store.setSoundVolume(Number(e.target.value))} className="flex-1 accent-[#8f7dff]" />
      </label>
    </div>
  );
}

// ── The sky and the wish jar ───────────────────────────────────────────────
function Sky({ me, partnerName }) {
  const wishes = useBedroomStore((state) => state.wishes);
  const coupleId = useRoomStore((state) => state.coupleId) ?? "our-place";
  const canvas = useRef(null);
  const [wishable, setWishable] = useState(null);
  const [wish, setWish] = useState("");
  const [share, setShare] = useState(false);
  const [note, setNote] = useState(null);
  const madeFor = useRef(null);

  // The same sky as the window: stars, and the shooting stars on the shared clock.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const g = el.getContext("2d");
    const stars = Array.from({ length: 120 }, (_, i) => ({ x: Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, y: Math.abs(Math.sin(i * 78.233) * 12345.6789) % 1, r: i % 9 === 0 ? 1.6 : 0.9, phase: i }));
    let frame = 0;
    const draw = () => {
      const w = el.width;
      const h = el.height;
      const now = Date.now() + (useRoomStore.getState().skewMs ?? 0);
      const gradient = g.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, "#050822");
      gradient.addColorStop(1, "#231c4a");
      g.fillStyle = gradient;
      g.fillRect(0, 0, w, h);
      for (const s of stars) {
        g.globalAlpha = 0.45 + 0.4 * Math.sin(now / 900 + s.phase);
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(s.x * w, s.y * h * 0.85, s.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      const { crossing, wishable: open } = skyAt(coupleId, now);
      if (crossing) {
        const p = crossing.progress;
        const dx = Math.cos(crossing.angle) * crossing.length;
        const dy = Math.sin(crossing.angle) * crossing.length;
        const hx = (crossing.x + dx * p) * w;
        const hy = (crossing.y + dy * p) * h;
        const tail = g.createLinearGradient(hx - dx * w * 0.5, hy - dy * h * 0.5, hx, hy);
        tail.addColorStop(0, "rgba(255,255,255,0)");
        tail.addColorStop(1, `rgba(255,255,255,${Math.sin(p * Math.PI)})`);
        g.strokeStyle = tail;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(hx - dx * w * 0.5, hy - dy * h * 0.5);
        g.lineTo(hx, hy);
        g.stroke();
      }
      setWishable((current) => (current?.id === open?.id ? current : open));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [coupleId]);

  const canWish = wishable && madeFor.current !== wishable.id;
  const submit = async (event) => {
    event.preventDefault();
    if (!wish.trim()) return;
    const failed = await useBedroomStore.getState().makeWish(wish.trim(), share);
    if (failed) setNote(failed === "rate_limited" ? "One wish per star 🌠" : "Couldn't save the wish — try again.");
    else {
      madeFor.current = wishable?.id ?? null;
      setWish("");
      setNote(share ? "Wish made — and shared 💫" : "Wish made — it's a secret 🤫");
    }
  };

  const mine = wishes.filter((w) => w.userId === me);
  const theirs = wishes.filter((w) => w.userId !== me);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[var(--radius-md)]">
        <canvas ref={canvas} width={640} height={260} className="block h-auto w-full" aria-label="The night sky. Shooting stars pass now and then." role="img" />
        <p className="absolute inset-x-0 bottom-2 text-center text-micro tracking-normal text-white/80">
          {canWish ? "🌠 A shooting star! Make a wish…" : "Watch for a shooting star — you'll both see the same one"}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={200} placeholder={canWish ? "I wish…" : "Wait for a shooting star to make a wish"} aria-label="Your wish" disabled={!canWish} className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black-800 px-3 text-caption text-white-soft disabled:opacity-50" />
        <label className="flex items-center gap-1.5 text-micro tracking-normal text-text-secondary">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="accent-[#8f7dff]" /> Share it with {partnerName}
        </label>
        <button type="submit" disabled={!canWish || !wish.trim()} className="min-h-10 rounded-full bg-[#5b4bb7] px-4 text-caption font-semibold text-white disabled:opacity-50">
          Wish 🌠
        </button>
      </form>
      {note && <p role="status" className="text-micro tracking-normal text-[#c7bfff]">{note}</p>}

      <div className="flex flex-col gap-1.5">
        <p className="micro-caps text-text-muted">
          The wish jar ✨ · {wishes.length} wish{wishes.length === 1 ? "" : "es"}
        </p>
        {wishes.length === 0 && <p className="text-micro tracking-normal text-text-muted">Empty for now. Catch a shooting star.</p>}
        <ul className="flex flex-col gap-1">
          {mine.map((w) => (
            <li key={w.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-black-800 px-3 py-1.5 text-caption text-white-soft">
              <span className="min-w-0 flex-1">
                {w.wish}
                <span className="block text-[0.62rem] text-text-muted">yours · {new Date(w.createdAt).toLocaleDateString()} · {w.shared ? "shared" : "secret"}</span>
              </span>
              <button type="button" onClick={() => useBedroomStore.getState().updateWish(w.id, { shared: !w.shared })} className="text-micro tracking-normal text-text-secondary underline-offset-2 hover:underline">
                {w.shared ? "Keep secret" : "Share"}
              </button>
              <button type="button" onClick={() => window.confirm("Take this wish out of the jar?") && useBedroomStore.getState().updateWish(w.id, { remove: true })} className="text-micro tracking-normal text-text-muted underline-offset-2 hover:underline">
                Remove
              </button>
            </li>
          ))}
          {theirs.map((w) => (
            <li key={w.id} className="rounded-[var(--radius-sm)] bg-pink-500/10 px-3 py-1.5 text-caption text-white-soft">
              {w.wish ?? <span className="text-text-secondary">🔒 {partnerName} made a secret wish</span>}
              <span className="block text-[0.62rem] text-text-muted">
                {partnerName} · {new Date(w.createdAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[0.62rem] text-text-muted">A shooting star lasts {Math.round(STAR_MS / 100) / 10} s — you have a few seconds after it to wish.</p>
    </div>
  );
}
