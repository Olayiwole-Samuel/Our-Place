"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/Toaster";
import { isSupabaseConfigured } from "@/lib/config/env";
import { AuthStoreContext, authStateFromViewer, createAuthStore } from "@/store/authStore";
import { CharacterStoreContext, createCharacterStore } from "@/store/characterStore";
import { CoupleStoreContext, createCoupleStore } from "@/store/coupleStore";
import { toast } from "@/store/toastStore";

const coupleFromViewer = (viewer) => (viewer.status === "signed_in" ? viewer.couple : null);
const charactersFromViewer = (viewer) => (viewer.status === "signed_in" ? (viewer.characters ?? {}) : {});

/**
 * Creates the app's stores from the server-resolved `viewer` (one instance per
 * page — never shared across requests) and keeps them in step with the session:
 *
 * - after router.refresh() the server sends a new viewer → stores re-sync
 * - Supabase auth events (sign-out elsewhere, account switch) → router.refresh()
 * - an API call reporting an ended session → toast + router.refresh()
 *
 * Also provides motion: Framer Motion's lightweight `m` components and the
 * user's reduced-motion preference applied to every animation.
 */
export function AppProviders({ viewer, children }) {
  const router = useRouter();
  const [authStore] = useState(() => createAuthStore(authStateFromViewer(viewer)));
  const [coupleStore] = useState(() =>
    createCoupleStore(coupleFromViewer(viewer), {
      onSessionExpired: () => {
        toast("Your session ended. Sign in again.", "error");
        authStore.getState().setLoading();
        router.refresh();
      },
    }),
  );

  const [characterStore] = useState(() =>
    createCharacterStore(charactersFromViewer(viewer), {
      onSessionExpired: () => {
        toast("Your session ended. Sign in again.", "error");
        authStore.getState().setLoading();
        router.refresh();
      },
    }),
  );

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    authStore.getState().sync(viewer);
    const couple = coupleFromViewer(viewer);
    if (couple) coupleStore.getState().sync(couple);
    else coupleStore.getState().reset();
    characterStore.getState().sync(charactersFromViewer(viewer));
  }, [viewer, authStore, coupleStore, characterStore]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    let subscription = null;
    let cancelled = false;
    // The Supabase SDK is loaded after the first paint, not in the initial bundle.
    import("@/lib/supabase/client").then(({ getSupabaseBrowserClient }) => {
      if (cancelled) return;
      const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        const knownUserId = authStore.getState().user?.id ?? null;
        const sessionUserId = session?.user?.id ?? null;
        if (knownUserId !== sessionUserId) {
          authStore.getState().setLoading();
          router.refresh();
        }
      });
      subscription = data.subscription;
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [authStore, router]);

  return (
    <AuthStoreContext.Provider value={authStore}>
      <CoupleStoreContext.Provider value={coupleStore}>
        <CharacterStoreContext.Provider value={characterStore}>
        {/* Features load synchronously: with async features, animated content would
            sit at its invisible `initial` state until the chunk arrived (or forever,
            if it failed). */}
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            {children}
            <Toaster />
          </MotionConfig>
        </LazyMotion>
        </CharacterStoreContext.Provider>
      </CoupleStoreContext.Provider>
    </AuthStoreContext.Provider>
  );
}
