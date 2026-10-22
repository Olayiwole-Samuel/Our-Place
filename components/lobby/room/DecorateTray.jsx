"use client";

import { AnimatePresence, m } from "motion/react";
import { Check, Heart, Lock, RotateCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { DECOR, DECOR_CATEGORIES, DECOR_ITEMS } from "@/lib/room/decor";
import { messageFor, useDecorStore } from "@/store/decorStore";
import { useRoomStore } from "@/store/roomStore";

/**
 * Decorate's controls along the bottom: your hearts, the catalogue by
 * category (free, unlocked ✓, or 🔒 with its price), and while placing or
 * moving something: Turn, Place / Done, Remove, Cancel. Tap or drag on the
 * floor to put it where you want (useWorldControls); tap something already
 * placed to pick it up.
 */
const HOW_TO_EARN = "Hearts come from days you're both here, finished games, photos, notes, messages, months together and your best streak.";

export function DecorateTray() {
  const active = useDecorStore((state) => state.active);
  return <AnimatePresence>{active && <Tray key="tray" />}</AnimatePresence>;
}

function Tray() {
  const { category, placing, problem, busy, message } = useDecorStore();
  const hearts = useRoomStore((state) => state.hearts);
  const unlocks = useRoomStore((state) => state.unlocks);
  const [confirm, setConfirm] = useState(null); // item id waiting for "Unlock for N?"
  const [info, setInfo] = useState(false);
  const store = useDecorStore.getState();
  const owned = (entry) => entry.cost === 0 || unlocks.has(entry.id);

  const choose = async (entry) => {
    if (owned(entry)) {
      setConfirm(null);
      store.startPlacing(entry.id);
      return;
    }
    if (confirm !== entry.id) {
      setConfirm(entry.id);
      return;
    }
    const code = await useRoomStore.getState().unlockDecor(entry.id);
    setConfirm(null);
    if (code) store.say(messageFor(code));
    else store.startPlacing(entry.id);
  };

  const entry = placing ? DECOR[placing.item] : null;

  return (
    <m.section
      aria-label="Decorate"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24, transition: { duration: 0.15 } }}
      className="decorate-tray panel pointer-events-auto absolute right-3 bottom-3 left-3 z-40 flex flex-col gap-2 rounded-[var(--radius-lg)] p-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)] short:top-2 short:right-2 short:bottom-2 short:left-auto short:w-[17rem] short:gap-1.5 short:p-2"
    >
      <header className="flex flex-wrap items-center gap-2 short:gap-1.5">
        <h2 className="text-caption font-semibold text-white-soft">Decorate</h2>
        <button type="button" onClick={() => setInfo((v) => !v)} className="flex items-center gap-1 rounded-full bg-black-800 px-2 py-0.5 text-micro font-semibold tracking-normal text-pink-400" aria-label={`${hearts?.balance ?? 0} hearts. How to earn hearts`}>
          <Heart aria-hidden="true" size={12} fill="currentColor" /> {hearts ? hearts.balance.toLocaleString() : "…"}
        </button>
        <p className={`min-w-0 flex-1 truncate text-micro tracking-normal short:order-last short:basis-full short:whitespace-normal ${problem ? "text-pink-400" : "text-text-muted"}`}>{placing ? (problem ?? "Tap or drag on the floor to move it") : "Pick something, or tap a thing in the room to move it"}</p>
        <button type="button" onClick={() => store.close()} className="flex min-h-9 items-center gap-1 rounded-[var(--radius-md)] bg-green-600 px-3 text-caption font-semibold text-white">
          <Check aria-hidden="true" size={14} /> Done
        </button>
      </header>
      {info && <p className="text-micro tracking-normal text-text-secondary">{HOW_TO_EARN}</p>}
      {message && (
        <p role="status" className="text-micro tracking-normal text-pink-400">
          {message}
        </p>
      )}

      {placing ? (
        <div className="flex flex-wrap items-center gap-2 short:gap-1.5">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-caption text-white-soft">
            <span aria-hidden="true" className="text-[1.3rem]">
              {entry?.icon}
            </span>
            <span className="truncate">{entry?.name}</span>
          </span>
          <button type="button" onClick={() => store.rotate()} className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 text-caption text-white-soft">
            <RotateCw aria-hidden="true" size={14} /> Turn
          </button>
          {placing.id && (
            <button type="button" disabled={busy} onClick={() => store.remove()} className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 text-caption text-pink-400">
              <Trash2 aria-hidden="true" size={14} /> Remove
            </button>
          )}
          <button type="button" onClick={() => store.cancel()} className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-caption text-text-secondary">
            <X aria-hidden="true" size={14} /> Cancel
          </button>
          <button type="button" disabled={Boolean(problem) || busy} onClick={() => store.confirm()} className="flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] bg-green-600 px-4 text-caption font-semibold text-white disabled:opacity-40">
            <Check aria-hidden="true" size={14} /> {busy ? "Saving…" : placing.id ? "Put here" : "Place"}
          </button>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Kinds of things" className="flex gap-1 overflow-x-auto overscroll-contain short:flex-wrap">
            {DECOR_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                onClick={() => store.setCategory(c.id)}
                className={`min-h-8 shrink-0 rounded-full px-3 text-micro tracking-normal short:min-h-7 short:px-2.5 ${category === c.id ? "bg-green-700/70 font-semibold text-white-soft" : "bg-black-800 text-text-secondary"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <ul className="flex gap-1.5 overflow-x-auto overscroll-contain pb-0.5 short:grid short:min-h-0 short:flex-1 short:grid-cols-3 short:content-start short:overflow-x-hidden short:overflow-y-auto">
            {DECOR_ITEMS.filter((item) => item.category === category).map((item) => {
              const have = owned(item);
              const asking = confirm === item.id;
              const affordable = (hearts?.balance ?? 0) >= item.cost;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    aria-label={have ? `Place ${item.name}` : `${item.name}: unlock for ${item.cost} hearts`}
                    className={`flex h-[4.6rem] w-[5.4rem] flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border px-1 text-center transition-transform active:scale-95 short:h-[3.7rem] short:w-full ${asking ? "border-pink-400 bg-pink-500/15" : "border-transparent bg-black-800 hover:bg-black-700"}`}
                  >
                    <span aria-hidden="true" className={`text-[1.4rem] leading-none ${have ? "" : "opacity-60 grayscale"}`}>
                      {item.icon}
                    </span>
                    <span className="w-full truncate text-micro tracking-normal text-white-soft">{item.name}</span>
                    <span className={`flex items-center gap-0.5 text-[0.62rem] ${have ? "text-green-500" : affordable ? "text-pink-400" : "text-text-muted"}`}>
                      {have ? (
                        item.cost ? "✓ yours" : "Free"
                      ) : asking ? (
                        affordable ? `Unlock for ${item.cost}?` : `Need ${item.cost - (hearts?.balance ?? 0)} more`
                      ) : (
                        <>
                          <Lock aria-hidden="true" size={9} /> {item.cost} <Heart aria-hidden="true" size={9} fill="currentColor" />
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </m.section>
  );
}
