"use client";

import { create } from "zustand";

/**
 * App-wide feedback toasts. Only ever written from event handlers in the
 * browser, so a module-level store is safe here.
 *
 * tone: "neutral" | "success" | "relationship" | "error"
 */
let nextId = 1;
const DURATION_MS = 3600;

export const useToastStore = create((set, get) => ({
  toasts: [],
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  show: ({ message, tone = "neutral" }) => {
    const id = nextId++;
    // Keep at most three on screen; the newest wins.
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), DURATION_MS);
    return id;
  },
}));

/** Convenience for event handlers: `toast("Code copied", "relationship")`. */
export function toast(message, tone) {
  return useToastStore.getState().show({ message, tone });
}
