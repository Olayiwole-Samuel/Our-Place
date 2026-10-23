"use client";

import { AnimatePresence, m } from "motion/react";
import { Heart, House, Images, PawPrint, Sofa, StickyNote, Trophy, Tv, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useUploadStore } from "@/lib/room/uploads";
import { livingRoom } from "@/lib/world/rooms/livingRoom";
import { travel } from "@/lib/world/travel";
import { useDecorStore } from "@/store/decorStore";
import { useWorldStore } from "@/store/worldStore";
import { useRoomStore } from "@/store/roomStore";
import { HudButton } from "../comms/HudButton";
import { MemoriesPanel } from "./MemoriesPanel";
import { DogPanel } from "./DogPanel";
import { FramesPanel } from "./FramesPanel";
import { NotesPanel } from "./NotesPanel";
import { ShelfPanel } from "./ShelfPanel";
import { TvPanel } from "./TvPanel";
import { UsPanel, specialDay } from "./UsPanel";
import { togetherSince } from "@/lib/room/together";

/** Whichever room panel is open (walk up to it in the room, or use the Room button). */
export function RoomPanels({ me, partner, partnerName, runtime }) {
  const panel = useRoomStore((state) => state.panel);
  const since = useRoomStore((state) => state.togetherSince);
  const myName = me.displayName?.split(" ")[0] || "You";

  // On a monthsary or anniversary, "Us" opens by itself — once per day per device.
  useEffect(() => {
    const day = specialDay(since);
    if (!day || useRoomStore.getState().panel) return;
    const key = `our-place:us-celebrated:${day}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // private mode: still celebrate
    }
    useRoomStore.getState().openPanel("us");
  }, [since]);

  return (
    <AnimatePresence>
      {panel !== "tv" && <UploadChip key="upload" />}
      {panel === "us" && <UsPanel key="us" myName={myName} partnerName={partnerName} />}
      {panel === "dog" && <DogPanel key="dog" runtime={runtime} />}
      {panel === "frames" && <FramesPanel key="frames" />}
      {panel === "notes" && <NotesPanel key="notes" me={me.id} partnerName={partnerName} />}
      {panel === "memories" && <MemoriesPanel key="memories" me={me.id} partnerName={partnerName} />}
      {panel === "tv" && <TvPanel key="tv" me={me.id} partnerName={partnerName} />}
      {panel === "shelf" && <ShelfPanel key="shelf" me={me.id} partner={partner.id} partnerName={partnerName} />}
    </AnimatePresence>
  );
}

const PLACES = [
  { id: "us", label: "Us", Icon: Heart },
  { id: "dog", label: "Dog", Icon: PawPrint },
  { id: "decorate", label: "Decorate", Icon: Sofa },
  { id: "tv", label: "TV", Icon: Tv },
  { id: "memories", label: "Memories", Icon: Images },
  { id: "notes", label: "Notes", Icon: StickyNote },
  { id: "shelf", label: "Trophies", Icon: Trophy },
];

/** Quick access to the room's places, without walking (handy on phones). */
export function RoomMenu({ disabled = false, runtime = null }) {
  const [open, setOpen] = useState(false);
  const unseen = useRoomStore((state) => state.unseenNotes);
  const panel = useRoomStore((state) => state.panel);
  const menuId = useId();
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => !rootRef.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <div ref={rootRef} className="room-menu-anchor pointer-events-auto">
      <div className="relative">
        <HudButton
          label={unseen ? `Room, ${unseen} new note${unseen === 1 ? "" : "s"}` : "Room"}
          expanded={open}
          controls={open ? menuId : undefined}
          tone={open || panel ? "active" : "default"}
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
          badge={unseen ? <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-[0.6875rem] leading-none text-black-950">{unseen > 9 ? "9+" : unseen}</span> : null}
        >
          <House aria-hidden="true" size={18} strokeWidth={1.75} />
        </HudButton>
        <AnimatePresence>
          {open && (
            <m.ul
              id={menuId}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6, transition: { duration: 0.1 } }}
              className="panel absolute top-0 right-full z-40 mr-2 flex w-max flex-col gap-0.5 rounded-[var(--radius-md)] p-1"
            >
              {PLACES.map(({ id, label, Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (id === "decorate") {
                        useRoomStore.getState().closePanel();
                        // Decorating is for the living room: from anywhere else, go home first.
                        if (runtime && useWorldStore.getState().roomId !== "living_room") {
                          travel(runtime, "living_room", "door");
                          setTimeout(() => useDecorStore.getState().open(livingRoom), 450);
                        } else useDecorStore.getState().open(livingRoom);
                      } else useRoomStore.getState().openPanel(id);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-left text-caption text-white-soft hover:bg-black-700 short:min-h-8"
                  >
                    <Icon aria-hidden="true" size={15} className="text-text-secondary" /> {label}
                    {id === "notes" && unseen > 0 && <span className="ml-auto rounded-full bg-pink-500 px-1.5 text-[0.65rem] font-semibold text-black-950">{unseen} new</span>}
                  </button>
                </li>
              ))}
            </m.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A video still uploading (or paused) while the TV is closed — tap to open the TV. */
function UploadChip() {
  const current = useUploadStore((state) => state.current);
  if (!current?.videoId || current.status === "failed") return null;
  const pct = Math.min(100, Math.floor((current.loaded / Math.max(1, current.total)) * 100));
  const paused = current.status === "paused";
  return (
    <m.button
      type="button"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      onClick={() => useRoomStore.getState().openPanel("tv")}
      aria-label={`${paused ? "Upload paused" : "Uploading"} ${current.title}, ${pct}%. Open the TV`}
      className="panel pointer-events-auto absolute top-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full py-1 pr-3 pl-2 text-micro tracking-normal text-white-soft short:top-12"
    >
      <Upload aria-hidden="true" size={13} className={paused ? "text-[#ffb35c]" : "text-green-500"} />
      <span className="max-w-[10rem] truncate">{current.title}</span>
      <span className="h-1 w-14 overflow-hidden rounded-full bg-black-950">
        <span className={`block h-full transition-[width] duration-300 ${paused ? "bg-[#ffb35c]" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-semibold">{paused ? "Paused" : `${pct}%`}</span>
    </m.button>
  );
}

/** 💞 days together — opens "Us". */
export function TogetherChip() {
  const since = useRoomStore((state) => state.togetherSince);
  if (!since) return null;
  const { days, next, today } = togetherSince(since);
  const label = `${days} days together${today.monthsary ? " — happy anniversary!" : `, next anniversary in ${next.inDays} days`}`;
  return (
    <button type="button" title={label} aria-label={`${label}. Open Us`} onClick={() => useRoomStore.getState().openPanel("us")} className={`together-chip panel pointer-events-auto flex h-[var(--control-size)] items-center gap-1 rounded-[var(--radius-md)] px-2.5 text-caption font-semibold text-[#ff8fb1] ${today.monthsary ? "is-special" : ""}`}>
      <span aria-hidden="true" className="together-chip-heart">
        💞
      </span>
      {days.toLocaleString()}
    </button>
  );
}

/** 🔥 days in a row you were both here. */
export function StreakBadge() {
  const streak = useRoomStore((state) => state.streak);
  const ready = useRoomStore((state) => state.ready);
  if (!ready) return null;
  const label = streak.current
    ? `${streak.current}-day streak together${streak.todayBoth ? " — today counts" : " — be here together today to keep it"}`
    : "Start a streak: be here together today";
  return (
    <span role="status" title={label} aria-label={label} className={`panel pointer-events-auto flex h-[var(--control-size)] items-center gap-1 rounded-[var(--radius-md)] px-2.5 text-caption font-semibold ${streak.current ? (streak.todayBoth ? "text-[#ffb35c]" : "text-text-secondary") : "text-text-muted"}`}>
      <span aria-hidden="true" className={streak.todayBoth ? "" : "grayscale"}>
        🔥
      </span>
      {streak.current}
    </span>
  );
}

/** "King started a movie" — a nudge to open the TV when it's playing and you aren't watching. */
export function NowPlayingChip({ me, partnerName }) {
  const watch = useRoomStore((state) => state.watch);
  const panel = useRoomStore((state) => state.panel);
  if (!watch?.source || !watch.playing || panel === "tv") return null;
  return (
    <button type="button" onClick={() => useRoomStore.getState().openPanel("tv")} className="now-playing-chip panel pointer-events-auto flex max-w-[min(22rem,60vw)] items-center gap-2 rounded-full py-1.5 pr-3 pl-2 text-caption text-white-soft">
      <Tv aria-hidden="true" size={15} className="shrink-0 text-blue-400" />
      <span className="truncate">
        {watch.updatedBy === me ? "Playing" : `${partnerName} is playing`}: <span className="font-semibold">{watch.source.title}</span>
      </span>
      <span className="shrink-0 font-semibold text-green-500">Watch</span>
    </button>
  );
}
