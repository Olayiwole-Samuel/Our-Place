"use client";

import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { AppError, ERROR_CATEGORY } from "@/lib/errors";
import { useAuthStore } from "@/store/authStore";
import { useCoupleStore } from "@/store/coupleStore";

// One chunk per screen: the server renders the current screen and the browser
// downloads only that screen's code (a signed-out visitor never loads pairing
// or 3D code). The loading fallback only appears on client-side transitions.
const screenLoading = () => <LoadingScreen />;
const WelcomeScreen = dynamic(() => import("@/components/auth/WelcomeScreen").then((mod) => mod.WelcomeScreen), {
  loading: screenLoading,
});
const PairingScreen = dynamic(() => import("@/components/pairing/PairingScreen").then((mod) => mod.PairingScreen), {
  loading: screenLoading,
});
const PairingSuccess = dynamic(() => import("@/components/pairing/PairingSuccess").then((mod) => mod.PairingSuccess), {
  loading: screenLoading,
});

const connectionError = new AppError(ERROR_CATEGORY.CONNECTION);

/** Paired (e.g. right after the celebration): hand over to the world route. */
function EnterWorld() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/lobby");
  }, [router]);
  return <LoadingScreen label="Preparing your space" />;
}

/**
 * Chooses the one screen the user should see, purely from centralized state:
 *
 *   unauthenticated / unconfigured  → welcome
 *   authenticated + unpaired        → pairing
 *   authenticated + just paired     → celebration
 *   authenticated + paired          → /lobby (the 3D world)
 *   loading                          → branded loading
 *   unavailable                      → connection error with retry
 */
export function selectStage(authStatus, coupleStatus, justPaired) {
  if (authStatus === "loading") return "loading";
  if (authStatus === "unavailable") return "unavailable";
  if (authStatus !== "authenticated") return "welcome";
  if (coupleStatus === "unpaired") return "pairing";
  if (coupleStatus === "paired") return justPaired ? "celebrate" : "place";
  return "loading";
}

export function AppStage({ authError }) {
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const coupleStatus = useCoupleStore((state) => state.status);
  const justPaired = useCoupleStore((state) => state.justPaired);
  const stage = selectStage(authStatus, coupleStatus, justPaired);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={stage}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: stage === "place" ? 0.8 : 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {stage === "welcome" && <WelcomeScreen authError={authError} unconfigured={authStatus === "unconfigured"} />}
        {stage === "pairing" && <PairingScreen />}
        {stage === "celebrate" && <PairingSuccess />}
        {stage === "place" && <EnterWorld />}
        {stage === "loading" && <LoadingScreen />}
        {stage === "unavailable" && <ErrorState error={connectionError} onRetry={() => router.refresh()} />}
      </m.div>
    </AnimatePresence>
  );
}
