"use client";

import { AnimatePresence, m } from "motion/react";
import { House, Images, StickyNote, Trophy, Tv } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import { HudButton } from "../comms/HudButton";
import { MemoriesPanel } from "./MemoriesPanel";
import { NotesPanel } from "./NotesPanel";
import { ShelfPanel } from "./ShelfPanel";
import { TvPanel } from "./TvPanel";

/** Whichever room panel is open (walk up to it in the room, or use the Room button). */
export function RoomPanels({ me, partner, partnerName }) {
  const panel = useRoomStore((state) => state.panel);
  return (
    <AnimatePresence>
      {panel === "notes" && <NotesPanel key="notes" me={me.id} partnerName={partnerName} />}
      {panel === "memories" && <MemoriesPanel key="memories" me={me.id} partnerName={partnerName} />}
      {panel === "tv" && <TvPanel key="tv" me={me.id} partnerName={partnerName} />}
      {panel === "shelf" && <ShelfPanel key="shelf" me={me.id} partner={partner.id} partnerName={partnerName} />}
    </AnimatePresence>
  );
}

const PLACES = [
  { id: "tv", label: "TV", Icon: Tv },
  { id: "memories", label: "Memories", Icon: Images },
  { id: "notes", label: "Notes", Icon: StickyNote },
  { id: "shelf", label: "Trophies", Icon: Trophy },
];

/** Quick access to the room's places, without walking (handy on phones). */
export function RoomMenu({ disabled = false }) {
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
                      useRoomStore.getState().openPanel(id);
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
