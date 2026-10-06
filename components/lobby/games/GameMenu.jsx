"use client";

import { AnimatePresence, m } from "motion/react";
import { ChevronRight, Clock, Lock, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GAME_CATEGORIES } from "@/lib/game/categories";
import { gameRegistry } from "@/lib/game/catalog";
import { gameAvailability, gameLabels } from "@/lib/game/gating";
import { preloadGameClient } from "@/lib/game/loader";
import { useChatStore } from "@/store/chatStore";
import { useGameStore } from "@/store/gameStore";
import { ACCENT_CLASSES, CATEGORY_ICONS } from "./categoryIcons";

const CATEGORIES = [...GAME_CATEGORIES].sort((a, b) => a.order - b.order);

/**
 * The in-world game menu: a compact vertical rail of the ten categories,
 * floating on the right edge of the living room. Tapping a category slides its
 * drawer out to the left; tapping an available game starts the launch flow.
 * The 3D room stays the hero — nothing here covers its centre.
 *
 * Only metadata is imported here (no game code): each game's modules load on
 * selection (lib/game/loader.js), and are pre-fetched on hover/focus.
 */
export function GameMenu({ disabled = false }) {
  const drawer = useGameStore((state) => state.drawer);
  const drawerId = useId();
  const railRef = useRef(null);
  const category = CATEGORIES.find((c) => c.id === drawer) ?? null;

  const toggle = (id) => {
    const store = useGameStore.getState();
    if (store.drawer === id) store.closeDrawer();
    else {
      useChatStore.getState().setOpen(false); // never stack the drawer on the chat panel
      store.openCategory(id);
    }
  };

  // Chat opening closes the drawer (they share the right side).
  const chatOpen = useChatStore((state) => state.open);
  useEffect(() => {
    if (chatOpen) useGameStore.getState().closeDrawer();
  }, [chatOpen]);

  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      useGameStore.getState().closeDrawer();
      railRef.current?.querySelector(`[data-category="${drawer}"]`)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  const onRailKey = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...railRef.current.querySelectorAll("[data-category]")];
    const index = buttons.indexOf(document.activeElement);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div className="game-rail-anchor pointer-events-auto">
      <nav aria-label="Game menu" className="relative">
        <div ref={railRef} role="toolbar" aria-orientation="vertical" aria-label="Game categories" onKeyDown={onRailKey} className="game-rail panel rounded-[var(--radius-lg)] p-1.5">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICONS[c.icon];
            const active = drawer === c.id;
            const accent = ACCENT_CLASSES[c.accent];
            return (
              <button
                key={c.id}
                type="button"
                data-category={c.id}
                disabled={disabled}
                aria-label={c.name}
                aria-expanded={active}
                aria-controls={active ? drawerId : undefined}
                title={c.name}
                onClick={() => toggle(c.id)}
                className={`game-rail-button group relative grid place-items-center rounded-[var(--radius-md)] transition-[background-color,color,transform] duration-150 active:scale-95 disabled:opacity-40 motion-reduce:transition-none ${
                  active ? `bg-black-700 ring-1 ${accent.ring} ${accent.text}` : "text-text-secondary hover:bg-black-800 hover:text-white-soft"
                }`}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
                {active && <span aria-hidden="true" className={`absolute top-1/2 -right-1 h-3 w-0.5 -translate-y-1/2 rounded-full ${accent.dot}`} />}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {category && <CategoryDrawer key={category.id} id={drawerId} category={category} onClose={() => useGameStore.getState().closeDrawer()} />}
        </AnimatePresence>
      </nav>
    </div>
  );
}

function CategoryDrawer({ id, category, onClose }) {
  const games = useMemo(() => gameRegistry.listByCategory(category.id), [category.id]);
  const accent = ACCENT_CLASSES[category.accent];
  const Icon = CATEGORY_ICONS[category.icon];
  const pending = useGameStore((state) => state.pending);
  const [notice, setNotice] = useState(null);

  const select = (definition, availability) => {
    if (!availability.launchable) {
      setNotice({ id: definition.id, text: availability.reason });
      return;
    }
    useGameStore.getState().launch(definition.id);
  };

  return (
    <m.aside
      id={id}
      aria-label={`${category.name} games`}
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="game-drawer panel absolute top-0 right-full mr-2 flex flex-col overflow-hidden rounded-[var(--radius-lg)] shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
    >
      <header className="flex items-start gap-3 border-b border-[var(--border-subtle)] py-3 pr-2 pl-4">
        <span aria-hidden="true" className={`mt-0.5 ${accent.text}`}>
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-caption font-semibold text-white-soft">{category.name}</h2>
          <p className="text-micro tracking-normal text-text-muted">{category.description}</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft">
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <ul className="flex-1 overflow-y-auto overscroll-contain p-1.5">
        {games.map((definition) => {
          const availability = gameAvailability(definition);
          return (
            <li key={definition.id}>
              <GameCard
                definition={definition}
                availability={availability}
                busy={pending === "create"}
                notice={notice?.id === definition.id ? notice.text : null}
                onSelect={() => select(definition, availability)}
              />
            </li>
          );
        })}
      </ul>
    </m.aside>
  );
}

function GameCard({ definition, availability, busy, notice, onSelect }) {
  const labels = gameLabels(definition);
  const playable = availability.launchable;
  return (
    <button
      type="button"
      aria-disabled={!playable || busy}
      onClick={onSelect}
      onPointerEnter={() => playable && preloadGameClient(definition)}
      onFocus={() => playable && preloadGameClient(definition)}
      className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors ${
        playable ? "hover:bg-black-700 focus-visible:bg-black-700" : "cursor-default"
      }`}
    >
      <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black-800 text-[1.1rem] leading-none ${playable ? "" : "opacity-60"}`}>
        {definition.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-caption font-semibold ${playable ? "text-white-soft" : "text-text-secondary"}`}>{definition.name}</span>
        <span className="block truncate text-micro tracking-normal text-text-muted">{definition.description}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro tracking-normal text-text-muted">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
          {definition.winStreakEligible && <span className="text-pink-400">🔥 Streak</span>}
          {definition.mature && <span className="text-red-500">18+</span>}
        </span>
        {notice && (
          <span role="status" className="mt-1 block text-micro tracking-normal text-text-secondary">
            {notice}
          </span>
        )}
      </span>
      {playable ? (
        <span className="flex shrink-0 items-center gap-1 text-micro font-semibold text-green-500">
          Play
          <ChevronRight aria-hidden="true" size={14} />
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-micro tracking-normal text-text-muted">
          {availability.status === "locked" ? <Lock aria-hidden="true" size={11} /> : <Clock aria-hidden="true" size={11} />}
          {availability.status === "locked" ? "18+ · Locked" : "Coming soon"}
        </span>
      )}
    </button>
  );
}
