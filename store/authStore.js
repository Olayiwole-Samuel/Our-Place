"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * Client representation of the authentication state. Created per app instance
 * (see components/app/AppProviders.jsx) — never a module-level singleton, which
 * would leak one user's state into another's server render.
 *
 * status:
 *   "loading"          a transition is in flight (e.g. signing out)
 *   "authenticated"    user is set
 *   "unauthenticated"
 *   "unavailable"      Supabase could not be reached; we don't know yet
 *   "unconfigured"     this deployment has no Supabase credentials
 *
 * The session itself lives in cookies managed by @supabase/ssr (never in
 * localStorage, never in this store). This store only mirrors what the server verified.
 */
export function authStateFromViewer(viewer) {
  switch (viewer.status) {
    case "signed_in":
      return { status: "authenticated", user: viewer.user };
    case "signed_out":
      return { status: "unauthenticated", user: null };
    default:
      return { status: viewer.status, user: null };
  }
}

export function createAuthStore(initialState) {
  return createStore((set) => ({
    ...initialState,
    sync: (viewer) => set(authStateFromViewer(viewer)),
    setLoading: () => set({ status: "loading" }),
    setSignedOut: () => set({ status: "unauthenticated", user: null }),
  }));
}

export const AuthStoreContext = createContext(null);

export function useAuthStore(selector) {
  const store = useContext(AuthStoreContext);
  if (!store) throw new Error("useAuthStore must be used inside <AppProviders>.");
  return useStore(store, selector);
}

export function useAuthStoreApi() {
  return useContext(AuthStoreContext);
}
