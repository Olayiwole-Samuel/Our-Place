"use client";

import { create } from "zustand";
import { DECOR, ROTATION_STEP, decorColliders, placementProblem } from "@/lib/room/decor";
import { roomColliders, roomInteractables } from "@/lib/world/rooms/livingRoom";
import { useRoomStore } from "./roomStore";

/**
 * Decorate mode (the living room seen from above):
 *
 *   active     Decorate is open (movement off, overhead camera, the tray shows)
 *   category   the tray's tab
 *   placing    what's being placed or moved: { item, x, z, rotation, id? } (id = moving a placed one)
 *   problem    why it can't go here (null = it can) — "Something's already there"
 *   busy       saving
 *   message    a short note after an action ("Not enough hearts yet")
 *
 * Saving goes through roomStore (place_decor / move_decor / remove_decor), and the
 * database checks everything again.
 */
let room = null; // the room config (set on open)

const SNAP = 0.05;
const snap = (value) => Math.round(value / SNAP) * SNAP;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Can the thing being placed go where it is? */
export function problemFor(placing, roomConfig = room) {
  if (!placing || !roomConfig) return null;
  const entry = DECOR[placing.item];
  if (!entry) return "Unknown item";
  const others = useRoomStore.getState().decor.filter((thing) => thing.id !== placing.id);
  const count = others.filter((thing) => thing.item === placing.item).length;
  if (!placing.id && count >= entry.max) return `You can have ${entry.max} of these`;
  return placementProblem(entry, placing, {
    bounds: roomConfig.bounds,
    colliders: [...roomColliders(roomConfig), ...decorColliders(others)],
    keepClear: [...roomInteractables(roomConfig), ...Object.values(roomConfig.spawnPoints)],
  });
}

const MESSAGES = {
  not_enough_hearts: "Not enough hearts yet — play, chat and spend time here to earn more.",
  locked: "Unlock it first.",
  too_many: "There's no room for more of these.",
  invalid: "That can't go there.",
  unavailable: "Decorating isn't set up yet.",
};
export const messageFor = (code) => MESSAGES[code] ?? "Couldn't save that — try again.";

export const useDecorStore = create((set, get) => ({
  active: false,
  category: "dog",
  placing: null,
  problem: null,
  busy: false,
  message: null,

  open(roomConfig) {
    room = roomConfig;
    set({ active: true, placing: null, problem: null, message: null });
    useRoomStore.getState().refresh("hearts");
    useRoomStore.getState().refresh("decor");
  },
  close: () => set({ active: false, placing: null, problem: null, message: null }),
  setCategory: (category) => set({ category }),
  say: (message) => set({ message }),

  /** Start placing a new `item` near (x, z) — the middle of the open floor by default. */
  startPlacing(item, at = { x: 0, z: 1.8 }) {
    const placing = { item, x: snap(at.x), z: snap(at.z), rotation: 0 };
    set({ placing, problem: problemFor(placing), message: null });
  },
  /** Pick up something already placed, to move, turn or remove it. */
  startMoving(thing) {
    const placing = { item: thing.item, x: thing.x, z: thing.z, rotation: thing.rotation, id: thing.id };
    set({ placing, problem: problemFor(placing), message: null });
  },
  moveTo(x, z) {
    const current = get().placing;
    if (!current) return;
    const placing = { ...current, x: snap(x), z: snap(z) };
    set({ placing, problem: problemFor(placing) });
  },
  rotate(step = ROTATION_STEP) {
    const current = get().placing;
    if (!current) return;
    const placing = { ...current, rotation: Number(wrap(current.rotation + step).toFixed(4)) };
    set({ placing, problem: problemFor(placing) });
  },
  cancel: () => set({ placing: null, problem: null }),

  async confirm() {
    const { placing, problem, busy } = get();
    if (!placing || problem || busy) return;
    set({ busy: true, message: null });
    const store = useRoomStore.getState();
    const code = placing.id ? await store.moveDecor(placing) : await store.placeDecor(placing);
    set({ busy: false, ...(code ? { message: messageFor(code) } : { placing: null, problem: null }) });
  },

  async remove() {
    const { placing, busy } = get();
    if (!placing?.id || busy) return;
    set({ busy: true });
    const code = await useRoomStore.getState().removeDecor(placing.id);
    set({ busy: false, placing: null, problem: null, message: code ? messageFor(code) : null });
  },
}));
