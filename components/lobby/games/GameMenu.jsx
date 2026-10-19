"use client";

import { AnimatePresence, m } from "motion/react";
import { ChevronLeft, ChevronRight, CircleHelp, Clock, Gamepad2, Lock, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GAME_CATEGORIES } from "@/lib/game/categories";
import { gameRegistry } from "@/lib/game/catalog";
import { gameAvailability, gameLabels } from "@/lib/game/gating";
import { guideFor } from "@/lib/game/guides";
import { preloadGameClient } from "@/lib/game/loader";
import { useChatStore } from "@/store/chatStore";
import { MENU, useGameStore } from "@/store/gameStore";
import { HudButton } from "../comms/HudButton";
import { ACCENT_CLASSES, CATEGORY_ICONS } from "./categoryIcons";
import { GameGuide } from "./GameGuide";

const CATEGORIES = [...GAME_CATEGORIES].sort((a, b) => a.order - b.order);

/**
 * The in-world game menu: ONE Games button on the right edge of the living room.
 * Tapping it opens a panel listing the ten categories; tapping a category shows
 * its games in the same panel (Back returns to the categories); tapping an
 * available game starts the launch flow. The 3D room stays the hero.
 *
 * Only metadata is imported here (no game code): each game's modules load on
 * selection (lib/game/loader.js), and are pre-fetched on hover/focus.
 */
export function GameMenu({ disabled = false }) {
  const drawer = useGameStore((state) => state.drawer);
  const panelId = useId();
  const buttonRef = useRef(null);
  const open = drawer !== null;
  const category = CATEGORIES.find((c) => c.id === drawer) ?? null;

  const toggle = () => {
    const store = useGameStore.getState();
    if (store.drawer !== null) store.closeDrawer();
    else {
      useChatStore.getState().setOpen(false); // never stack the menu on the chat panel
      store.openMenu();
    }
  };

  // Chat opening closes the menu (they share the right side).
  const chatOpen = useChatStore((state) => state.open);
  useEffect(() => {
    if (chatOpen) useGameStore.getState().closeDrawer();
  }, [chatOpen]);

  // A game starting (or the menu being disabled) closes it.
  useEffect(() => {
    if (disabled) useGameStore.getState().closeDrawer();
  }, [disabled]);

  // Escape: back from a category to the list, then closed.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      const store = useGameStore.getState();
      if (store.drawer !== MENU) store.openMenu();
      else {
        store.closeDrawer();
        buttonRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="game-rail-anchor pointer-events-auto">
      <nav aria-label="Game menu" className="relative">
        <HudButton ref={buttonRef} label={open ? "Close games" : "Games"} expanded={open} controls={open ? panelId : undefined} tone={open ? "active" : "default"} disabled={disabled} onClick={toggle}>
          {open ? <X aria-hidden="true" size={19} strokeWidth={1.75} /> : <Gamepad2 aria-hidden="true" size={20} strokeWidth={1.75} />}
        </HudButton>

        <AnimatePresence>
          {open && (
            <m.aside
              key="game-menu"
              id={panelId}
              aria-label={category ? `${category.name} games` : "Game categories"}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="game-drawer panel absolute top-full right-0 mt-2 flex flex-col overflow-hidden rounded-[var(--radius-lg)] shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
            >
              {category ? <CategoryGames key={category.id} category={category} /> : <CategoryList />}
            </m.aside>
          )}
        </AnimatePresence>
      </nav>
    </div>
  );
}

function CategoryList() {
  return (
    <>
      <header className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-3 pr-2 pl-4 short:py-1.5">
        <h2 className="flex-1 text-caption font-semibold text-white-soft">Games</h2>
      </header>
      <ul className="flex-1 overflow-y-auto overscroll-contain p-1.5">
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <CategoryRow category={c} />
          </li>
        ))}
      </ul>
    </>
  );
}

function CategoryRow({ category }) {
  const Icon = CATEGORY_ICONS[category.icon];
  const accent = ACCENT_CLASSES[category.accent];
  const playable = useMemo(() => gameRegistry.listByCategory(category.id).filter((d) => gameAvailability(d).launchable).length, [category.id]);
  return (
    <button
      type="button"
      data-category={category.id}
      onClick={() => useGameStore.getState().openCategory(category.id)}
      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors hover:bg-black-700 focus-visible:bg-black-700 short:gap-2 short:py-1"
    >
      <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black-800 short:size-7 ${accent.text}`}>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-semibold text-white-soft">{category.name}</span>
        <span className="block truncate text-micro tracking-normal text-text-muted">{playable ? `${playable} to play` : "Coming soon"}</span>
      </span>
      <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-text-muted" />
    </button>
  );
}

function CategoryGames({ category }) {
  // Playable games first, then the rest in catalog order.
  const games = useMemo(() => {
    const list = gameRegistry.listByCategory(category.id);
    return [...list.filter((g) => gameAvailability(g).launchable), ...list.filter((g) => !gameAvailability(g).launchable)];
  }, [category.id]);
  const accent = ACCENT_CLASSES[category.accent];
  const pending = useGameStore((state) => state.pending);
  const [notice, setNotice] = useState(null);
  const [guide, setGuide] = useState(null); // definition whose "how to play" is open

  const select = (definition, availability) => {
    if (!availability.launchable) {
      setNotice({ id: definition.id, text: availability.reason });
      return;
    }
    useGameStore.getState().launch(definition.id);
  };

  return (
    <>
      <header className="flex items-start gap-1 border-b border-[var(--border-subtle)] py-2 pr-2 pl-1.5 short:py-1">
        <button type="button" aria-label="Back to categories" onClick={() => useGameStore.getState().openMenu()} className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft">
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h2 className={`text-caption font-semibold ${accent.text}`}>{category.name}</h2>
          <p className="text-micro tracking-normal text-text-muted">{category.description}</p>
        </div>
      </header>
      <ul className="flex-1 overflow-y-auto overscroll-contain p-1.5">
        {games.map((definition) => {
          const availability = gameAvailability(definition);
          return (
            <li key={definition.id} className="flex items-center gap-1">
              <GameCard
                definition={definition}
                availability={availability}
                busy={pending === "create"}
                notice={notice?.id === definition.id ? notice.text : null}
                onSelect={() => select(definition, availability)}
              />
              {guideFor(definition.id) && (
                <button
                  type="button"
                  aria-label={`How to play ${definition.name}`}
                  title="How to play"
                  onClick={() => setGuide(definition)}
                  className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-text-muted hover:bg-black-700 hover:text-white-soft short:size-8"
                >
                  <CircleHelp aria-hidden="true" size={17} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {guide && <GameGuide definition={guide} onClose={() => setGuide(null)} />}
    </>
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
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors short:py-1.5 ${
        playable ? "hover:bg-black-700 focus-visible:bg-black-700" : "cursor-default"
      }`}
    >
      <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-black-800 text-[1.1rem] leading-none short:size-7 ${playable ? "" : "opacity-60"}`}>
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
