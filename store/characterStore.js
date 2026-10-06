"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { characterApi } from "@/lib/character/client";
import { DEFAULT_CHARACTER, applyCharacterPatch, normalizeCharacterConfig, sameCharacter } from "@/lib/character/schema";
import { PAIRING_ERROR } from "@/lib/couple/errors";

/**
 * The single client source of truth for characters.
 *
 *   mine      your SAVED character (as confirmed by the server) or null
 *   partner   your partner's saved character (render-only) or null
 *   draft     the studio's working copy of your look — previewed live, never
 *             persisted until save() succeeds
 *   saving    a save is in flight
 *
 * Created per page (like the auth/couple stores) from the server-resolved
 * viewer; never a module singleton, so no state can leak between users.
 * Transient studio UI (active category, camera view) stays local to the studio.
 */
export function createCharacterStore(initial = {}, { onSessionExpired } = {}) {
  return createStore((set, get) => ({
    mine: initial.mine ?? null,
    partner: initial.partner ?? null,
    draft: normalizeCharacterConfig(initial.mine?.config ?? DEFAULT_CHARACTER),
    saving: false,

    sync: ({ mine = null, partner = null } = {}) => {
      const wasDirty = get().isDirty();
      set({ mine, partner });
      // Keep unsaved studio work; otherwise follow the saved character.
      if (!wasDirty) set({ draft: normalizeCharacterConfig(mine?.config ?? DEFAULT_CHARACTER) });
    },

    /** Live preview: apply a partial change to the draft (validated as it goes). */
    updateDraft: (patch) => set({ draft: applyCharacterPatch(get().draft, patch) }),
    replaceDraft: (config) => set({ draft: normalizeCharacterConfig(config) }),
    resetDraft: () => set({ draft: normalizeCharacterConfig(get().mine?.config ?? DEFAULT_CHARACTER) }),

    /** True when the draft differs from what's saved (or nothing is saved yet). */
    isDirty: () => !get().mine || !sameCharacter(get().mine.config, get().draft),

    /** Persist the draft. Success is reported only after the server confirms. */
    save: async () => {
      if (get().saving) return { ok: false, code: PAIRING_ERROR.INVALID_REQUEST };
      set({ saving: true });
      const result = await characterApi.save(get().draft);
      if (result.ok) set({ mine: result.data.character, draft: normalizeCharacterConfig(result.data.character.config) });
      if (!result.ok && result.code === PAIRING_ERROR.NOT_AUTHENTICATED) onSessionExpired?.();
      set({ saving: false });
      return result;
    },

    /** After a provider import the server has a new saved character. */
    setMine: (mine) => set({ mine, draft: normalizeCharacterConfig(mine?.config ?? DEFAULT_CHARACTER) }),

    refresh: async () => {
      const result = await characterApi.get();
      if (result.ok) get().sync(result.data);
      return result;
    },
  }));
}

export const CharacterStoreContext = createContext(null);

export function useCharacterStore(selector) {
  const store = useContext(CharacterStoreContext);
  if (!store) throw new Error("useCharacterStore must be used inside <AppProviders>.");
  return useStore(store, selector);
}

export function useCharacterStoreApi() {
  return useContext(CharacterStoreContext);
}
