"use client";

import { useState } from "react";
import { characterApi } from "@/lib/character/client";
import { LOOKS, currentLook } from "@/lib/character/looks";
import { toast } from "@/store/toastStore";
import { useCharacterStore, useCharacterStoreApi } from "@/store/characterStore";

/** Saves a look and tells the partner, so they see the change straight away. */
export function useSwitchLook(runtime) {
  const store = useCharacterStoreApi();
  const [saving, setSaving] = useState(null);
  const choose = async (id) => {
    if (saving || currentLook(store.getState().mine) === id) return;
    setSaving(id);
    const result = await characterApi.useGallery(id);
    setSaving(null);
    if (!result.ok) {
      toast("Couldn't change your character. Try again.", "error");
      return;
    }
    store.getState().setMine(result.data.character);
    runtime?.presence?.announceCharacter?.();
  };
  return { choose, saving };
}

/**
 * Male / Female: switches YOUR character in the world, any time — also while a
 * game is open. Hidden until the characters are built (docs/characters.md).
 */
export function CharacterSwitch({ runtime, className = "" }) {
  const mine = useCharacterStore((state) => state.mine);
  const { choose, saving } = useSwitchLook(runtime);
  if (!LOOKS.length) return null;
  const active = currentLook(mine);
  return (
    <div role="radiogroup" aria-label="Your character" className={`grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-black-950/60 p-1 ${className}`}>
      {LOOKS.map((look) => {
        const checked = active === look.id;
        return (
          <button
            key={look.id}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={Boolean(saving)}
            onClick={() => choose(look.id)}
            className={`min-h-10 rounded-[var(--radius-sm)] px-3 text-caption font-semibold transition-colors ${
              checked ? "bg-green-600 text-white" : "text-text-secondary hover:bg-black-800 hover:text-white-soft"
            }`}
          >
            {saving === look.id ? "Changing…" : look.name}
          </button>
        );
      })}
    </div>
  );
}

/** First visit after the switch to stock characters: pick one (shown until chosen). */
export function ChooseCharacterCard({ runtime }) {
  const mine = useCharacterStore((state) => state.mine);
  if (!LOOKS.length || currentLook(mine)) return null;
  return (
    <section aria-label="Choose your character" className="panel pointer-events-auto flex flex-col gap-2 rounded-[var(--radius-lg)] p-3 text-center">
      <p className="text-caption text-white-soft">Choose your character</p>
      <CharacterSwitch runtime={runtime} />
    </section>
  );
}
