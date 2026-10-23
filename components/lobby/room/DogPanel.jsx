"use client";

import { m } from "motion/react";
import { PawPrint, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { dogAt, growthOf, moodOf } from "@/lib/pet/behaviour";
import { decorColliders } from "@/lib/room/decor";
import { livingRoom, roomColliders } from "@/lib/world/rooms/livingRoom";
import { travel } from "@/lib/world/travel";
import { useRoomStore } from "@/store/roomStore";
import { useWorldStore } from "@/store/worldStore";

/**
 * Your dog: a bar along the bottom (so you can watch it while you play) with
 * everything you'd do with a real dog — pet, treat, feed, fetch, sit, lie down,
 * come here, bedtime — and its name (named together the first time).
 *
 * A new request always takes over (calling the dog wakes it up). Each request carries where it happens (where the dog is, where you are, where
 * the ball lands), so both screens play exactly the same moment.
 */
const ACTIONS = [
  { id: "pet", icon: "🤍", label: "Pet" },
  { id: "treat", icon: "🦴", label: "Treat" },
  { id: "feed", icon: "🍖", label: "Feed" },
  { id: "fetch", icon: "🎾", label: "Fetch" },
  { id: "come", icon: "👋", label: "Come here" },
  { id: "sit", icon: "🐕", label: "Sit" },
  { id: "lie", icon: "🛋️", label: "Lie down" },
  { id: "sleep", icon: "💤", label: "Bedtime" },
];

const MESSAGES = { rate_limited: "One at a time 🐾", unavailable: "Your dog isn't set up yet.", invalid: "That didn't work — try again." };

function worldOf(room, decor, coupleId, createdAt) {
  return {
    key: decor.map((d) => `${d.item}@${d.x.toFixed(2)},${d.z.toFixed(2)},${d.rotation.toFixed(2)}`).join("|") || "empty",
    seed: coupleId ?? "our-place",
    bounds: room.bounds,
    colliders: [...roomColliders(room), ...decorColliders(decor)],
    placed: decor,
    dogSize: growthOf(createdAt ?? null, Date.now()).size,
  };
}

const ago = (iso) => {
  if (!iso) return "never";
  const minutes = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
};

function NameForm({ current, onDone }) {
  const [name, setName] = useState(current ?? "");
  const [error, setError] = useState(null);
  return (
    <form
      className="flex flex-1 items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const code = await useRoomStore.getState().namePet(name.trim());
        if (code) setError(code === "invalid" ? "1–24 letters, please." : MESSAGES[code] ?? "Couldn't save the name.");
        else onDone();
      }}
    >
      <input autoFocus value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Name your Maltese…" aria-label="Your dog's name" className="min-h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] bg-black-950/60 px-2 text-caption text-white-soft outline-none focus:ring-1 focus:ring-pink-400" />
      <button type="submit" disabled={!name.trim()} className="min-h-9 rounded-[var(--radius-sm)] bg-pink-500 px-3 text-caption font-semibold text-black-950 disabled:opacity-40">
        Save
      </button>
      {error && <span className="text-micro tracking-normal text-pink-400">{error}</span>}
    </form>
  );
}

export function DogPanel({ runtime }) {
  const pet = useRoomStore((state) => state.pet);
  const decor = useRoomStore((state) => state.decor);
  const coupleId = useRoomStore((state) => state.coupleId);
  const [naming, setNaming] = useState(false);
  const [message, setMessage] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && useRoomStore.getState().closePanel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const name = pet?.name;
  const mood = moodOf(pet, now);
  const room = livingRoom; // where the dog lives, wherever you are
  const roomId = useWorldStore((state) => state.roomId);
  const world = worldOf(room, decor, coupleId, pet?.createdAt);

  const ask = async (action) => {
    const serverNow = Date.now() + (useRoomStore.getState().skewMs ?? 0);
    const dog = dogAt(pet, world, serverNow);
    const me = runtime?.localPose ?? { x: 0, z: 2, ry: Math.PI };
    const data = { start: { x: +dog.x.toFixed(2), z: +dog.z.toFixed(2) }, from: { x: +me.x.toFixed(2), z: +me.z.toFixed(2) } };
    if (action === "fetch") {
      // The ball lands ~2.6 m in front of you, inside the room.
      const { bounds } = room;
      data.to = {
        x: +Math.min(bounds.maxX - 0.5, Math.max(bounds.minX + 0.5, me.x + Math.sin(me.ry) * 2.6)).toFixed(2),
        z: +Math.min(bounds.maxZ - 0.5, Math.max(bounds.minZ + 0.5, me.z + Math.cos(me.ry) * 2.6)).toFixed(2),
      };
    }
    const code = await useRoomStore.getState().petDo(action, data);
    setMessage(code ? MESSAGES[code] ?? "Your dog didn't hear that — try again." : null);
    if (!code) navigator.vibrate?.(15);
  };

  return (
    <m.section
      role="dialog"
      aria-modal="false"
      aria-label={name ? `${name}, your dog` : "Your dog"}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}
      className="dog-bar panel pointer-events-auto absolute bottom-3 left-1/2 z-30 flex w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-[var(--radius-lg)] p-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.45)] short:bottom-2 short:gap-1.5 short:p-2"
    >
      <header className="flex items-center gap-2">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f4efe6] text-black-950">
          <PawPrint size={16} />
        </span>
        {!name || naming ? (
          <NameForm current={name} onDone={() => setNaming(false)} />
        ) : (
          <p className="min-w-0 flex-1 truncate text-caption text-white-soft">
            <button type="button" onClick={() => setNaming(true)} className="inline-flex items-center gap-1 font-semibold hover:text-pink-400" aria-label={`Rename ${name}`}>
              {name} <Pencil aria-hidden="true" size={11} className="text-text-muted" />
            </button>{" "}
            {mood.text} {mood.icon} <span className="text-micro tracking-normal text-text-muted">· {growthOf(pet?.createdAt ?? null, now).label} · fed {ago(pet?.fedAt)}</span>
          </p>
        )}
        <button type="button" aria-label="Close" onClick={() => useRoomStore.getState().closePanel()} className="grid size-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-black-700">
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      {!name && <p className="text-micro tracking-normal text-text-secondary">Your new Maltese mix is here 🐾 — give them a name together.</p>}
      {roomId !== "living_room" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-text-secondary">{name ?? "Your dog"} is in the living room.</p>
          <button type="button" onClick={() => travel(runtime, "living_room", "door")} className="min-h-9 rounded-[var(--radius-md)] bg-green-600 px-3 text-caption font-semibold text-white">
            Go to {name ?? "them"}
          </button>
        </div>
      ) : (
      <div className="grid grid-cols-8 gap-1.5 short:gap-1">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => ask(action.id)}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] bg-black-800 px-1 text-micro tracking-normal text-white-soft transition-transform hover:bg-black-700 active:scale-95 short:min-h-10 ${mood.id === "hungry" && action.id === "feed" ? "ring-1 ring-pink-400" : ""} ${mood.id === "bored" && action.id === "fetch" ? "ring-1 ring-pink-400" : ""}`}
          >
            <span aria-hidden="true" className="text-[1.15rem] leading-none">
              {action.icon}
            </span>
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>
      )}
      {message && (
        <p role="status" className="text-center text-micro tracking-normal text-pink-400">
          {message}
        </p>
      )}
    </m.section>
  );
}
