"use client";

import { create } from "zustand";
import { initialPartnerPresence, partnerPresenceReducer } from "@/lib/world/partnerPresence";

/**
 * Reactive world state — only what the HUD and overlays need to re-render on.
 * Per-frame data (player poses, the partner's snapshot buffer, input, camera
 * yaw) lives in the non-reactive world runtime (lib/world/runtime.js) so moving
 * never re-renders React.
 *
 * Contains no auth state (authStore) and no game state (future gameStore).
 * Written only from browser event handlers/effects, so a module-level store is safe.
 *
 *   loadStage   "engine" (3D code loading) → "room" (building the scene)
 *               → "presence" (finding your person) → "ready" | "error"
 *   connection  "connecting" | "live" | "reconnecting" | "closed" | "unavailable"
 *   partner     see lib/world/partnerPresence.js
 *   interactionTarget   nearest interactable in range, or null
 *   activeInteraction   id of the object whose info card is open, or null
 *   seated      true while the local player sits on the couch
 *   inGame      a game launch/shell is open: movement keys and the joystick pause
 *               (characters stay present; chat, voice and emotes keep working)
 *   lookLocked  desktop cursor lock (Ctrl): the mouse turns the camera without dragging
 *   roomId      the room you're in (lib/world/rooms) — moving rooms: lib/world/travel.js
 *   partnerRoom the room your partner is in (from their presence), or null
 *   fading      the short fade while going through a door
 */
const initialState = {
  loadStage: "engine",
  connection: "connecting",
  partner: initialPartnerPresence,
  interactionTarget: null,
  activeInteraction: null,
  seated: false,
  inGame: false,
  lookLocked: false,
  roomId: "living_room",
  partnerRoom: null,
  fading: false,
};

export const useWorldStore = create((set, get) => ({
  ...initialState,

  setLoadStage: (loadStage) => {
    // Never move backwards once ready (e.g. a reconnect is not a reload).
    if (get().loadStage === "ready" && loadStage !== "error") return;
    set({ loadStage });
  },
  setConnection: (connection) => {
    set({ connection });
    if (connection !== "live") set({ partner: partnerPresenceReducer(get().partner, { type: "self_disconnected" }) });
  },
  dispatchPartner: (event) => set({ partner: partnerPresenceReducer(get().partner, event) }),
  setInteractionTarget: (target) => {
    if (get().interactionTarget?.id !== target?.id) set({ interactionTarget: target });
  },
  openInteraction: (id) => set({ activeInteraction: id }),
  closeInteraction: () => set({ activeInteraction: null }),
  setSeated: (seated) => set({ seated }),
  setInGame: (inGame) => {
    if (get().inGame !== inGame) set({ inGame });
  },
  setLookLocked: (lookLocked) => {
    if (get().lookLocked !== lookLocked) set({ lookLocked });
  },
  setRoom: (roomId) => set({ roomId, interactionTarget: null, activeInteraction: null, seated: false }),
  setPartnerRoom: (partnerRoom) => {
    if (get().partnerRoom !== partnerRoom) set({ partnerRoom });
  },
  setFading: (fading) => set({ fading }),
  reset: () => set(initialState),
}));
