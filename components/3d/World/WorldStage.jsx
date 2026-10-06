"use client";

import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useCallback } from "react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AppError, ERROR_CATEGORY } from "@/lib/errors";
import { performanceOverlayEnabled, usePerformanceStore } from "@/store/performanceStore";
import { useWorldStore } from "@/store/worldStore";

// three.js + R3F + the room ship as a separate chunk, loaded only here. The
// device's quality tier is assessed once, right before the world is created
// (a few synchronous reads — no benchmark scene).
const World = dynamic(
  () =>
    import("./World").then((module) => {
      usePerformanceStore.getState().init();
      return module;
    }),
  { ssr: false },
);
const PerformanceOverlay = dynamic(() => import("./PerformanceOverlay"), { ssr: false });

const worldLoadError = new AppError(ERROR_CATEGORY.ASSET_LOADING);

/** Real loading stages — each label maps to something actually happening. */
const STAGE_LABELS = {
  engine: "Loading your space",
  room: "Preparing your space",
  presence: "Finding your person",
};

/**
 * Mounts the 3D world full-screen with its loading overlay and error boundary.
 * Stages advance on real signals: the 3D chunk loaded (`room`), the first frame
 * drawn (`presence`), and the presence channel answering (`ready`, set by the
 * lobby). No fake percentages.
 *
 * Memoized: its inputs (runtime, partner profile, characters) are stable, so
 * HUD state changes in the lobby (connection, partner status, chat, voice, a
 * game opening) never re-render the 3D scene.
 */
export const WorldStage = memo(function WorldStage({ runtime, partner, myCharacter, partnerCharacter }) {
  const reducedMotion = useReducedMotion();
  const loadStage = useWorldStore((state) => state.loadStage);
  const setLoadStage = useWorldStore((state) => state.setLoadStage);

  const handleCreated = useCallback(() => setLoadStage("room"), [setLoadStage]);
  const handleFirstFrame = useCallback(() => setLoadStage("presence"), [setLoadStage]);

  return (
    <div className="app-viewport">
      <ErrorBoundary
        name="world"
        onError={() => setLoadStage("error")}
        fallback={({ error, reset }) => (
          <ErrorState
            error={worldLoadError}
            diagnostics={error?.stack ?? String(error)}
            onRetry={() => {
              setLoadStage("engine");
              reset();
            }}
          />
        )}
      >
        <World
          runtime={runtime}
          partner={partner}
          myCharacter={myCharacter}
          partnerCharacter={partnerCharacter}
          reducedMotion={reducedMotion}
          onCreated={handleCreated}
          onFirstFrame={handleFirstFrame}
        />
      </ErrorBoundary>
      {performanceOverlayEnabled() && loadStage === "ready" && <PerformanceOverlay />}
      <AnimatePresence>
        {STAGE_LABELS[loadStage] && (
          <m.div
            key="loading"
            className="absolute inset-0 z-30"
            initial={false}
            exit={{ opacity: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
          >
            <LoadingScreen label={STAGE_LABELS[loadStage]} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
});
