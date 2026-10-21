"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { coupleApi } from "@/lib/couple/client";
import { PAIRING_ERROR } from "@/lib/couple/errors";

/**
 * The single client representation of the couple. Phase 3+ reads couple id,
 * partner and membership from here — nothing else duplicates it.
 *
 *   status      "loading" | "unpaired" | "paired"
 *   me          own profile { id, displayName, avatarUrl, avatarThumbnail }
 *   partner     partner profile (paired only); displayName is YOUR nickname for them when
 *               you've set one ({ nickname, accountName } keep both)
 *   couple      { id, pairedAt } (paired only)
 *   invite      { code, expiresAt } | null (unpaired only)
 *   justPaired  true from the moment pairing is observed until the celebration is acknowledged
 *
 * Every value comes from the server (/api/couple). Actions never invent state:
 * they apply what the server returned, or report a failure code.
 */
const EMPTY = { status: "loading", me: null, partner: null, couple: null, invite: null };

export function coupleStateFromServer(state) {
  if (!state) return EMPTY;
  if (state.status === "paired") {
    return { status: "paired", me: state.me, partner: state.partner, couple: state.couple, invite: null };
  }
  return { status: "unpaired", me: state.me, partner: null, couple: null, invite: state.invite ?? null };
}

export function createCoupleStore(initialServerState, { onSessionExpired } = {}) {
  return createStore((set, get) => {
    const apply = (serverState) => {
      const next = coupleStateFromServer(serverState);
      const wasUnpaired = get().status === "unpaired";
      set({ ...next, justPaired: get().justPaired || (wasUnpaired && next.status === "paired") });
    };
    const handle = (result) => {
      if (!result.ok && result.code === PAIRING_ERROR.NOT_AUTHENTICATED) onSessionExpired?.();
      return result;
    };

    return {
      ...coupleStateFromServer(initialServerState),
      justPaired: false,

      /** Replace state with a fresh server snapshot (e.g. after router.refresh()). */
      sync: (serverState) => apply(serverState),

      refresh: async () => {
        const result = handle(await coupleApi.getState());
        if (result.ok) apply(result.data);
        return result;
      },

      createInvite: async () => {
        const result = handle(await coupleApi.createInvite());
        if (result.ok) set({ invite: result.data.invite });
        // Paired elsewhere (e.g. partner joined in another tab) — pick up the truth.
        if (!result.ok && result.code === PAIRING_ERROR.ALREADY_PAIRED) await get().refresh();
        return result;
      },

      join: async (code) => {
        const result = handle(await coupleApi.join(code));
        if (result.ok) apply(result.data);
        if (!result.ok && result.code === PAIRING_ERROR.ALREADY_PAIRED) await get().refresh();
        return result;
      },

      /** What you call your partner ("" clears it). The server returns the fresh couple, nickname applied. */
      setNickname: async (nickname) => {
        const result = handle(await coupleApi.setNickname(nickname));
        if (result.ok) apply(result.data);
        return result;
      },

      acknowledgePairing: () => set({ justPaired: false }),
      reset: () => set({ ...EMPTY, justPaired: false }),
    };
  });
}

export const CoupleStoreContext = createContext(null);

export function useCoupleStore(selector) {
  const store = useContext(CoupleStoreContext);
  if (!store) throw new Error("useCoupleStore must be used inside <AppProviders>.");
  return useStore(store, selector);
}

export function useCoupleStoreApi() {
  return useContext(CoupleStoreContext);
}
