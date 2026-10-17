"use client";

import { AnimatePresence, m } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { logConnection } from "@/lib/diagnostics/connectionLog";
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
// Rebuild the 3D scene this soon after the browser drops the GPU context.
const REBUILD_AFTER_MS = 400;
// Automatic retries after the room has loaded, before showing an error.
const MAX_SILENT_RETRIES = 2;
// Loading stages only move forward on the first build; a rebuild never hides the HUD again.
const loaded = () => useWorldStore.getState().loadStage === "ready";

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
  // Each "generation" is a fresh Canvas (and WebGL context). Phones drop the
  // GPU context under memory pressure or after the screen locks; the room then
  // rebuilds itself while presence, chat, voice and games carry on untouched.
  const [generation, setGeneration] = useState(0);
  const silentRetries = useRef(0);
  const rebuildTimer = useRef(null);
  useEffect(() => () => clearTimeout(rebuildTimer.current), []);

  const handleCreated = useCallback(() => !loaded() && setLoadStage("room"), [setLoadStage]);
  const handleFirstFrame = useCallback(() => !loaded() && setLoadStage("presence"), [setLoadStage]);
  const rebuild = useCallback((reason = "graphics context lost") => {
    logConnection("3d", `${reason} — rebuilding the room`);
    clearTimeout(rebuildTimer.current);
    rebuildTimer.current = setTimeout(() => setGeneration((n) => n + 1), REBUILD_AFTER_MS);
  }, []);

  return (
    <div className="app-viewport">
      <ErrorBoundary
        key={generation}
        name="world"
        onError={() => {
          // After the room has loaded, a 3D hiccup is retried quietly (the HUD stays up).
          if (loaded() && silentRetries.current < MAX_SILENT_RETRIES) {
            silentRetries.current += 1;
            rebuild("3d error");
          } else if (!loaded()) setLoadStage("error");
          else logConnection("3d", "3d error — showing retry");
        }}
        fallback={({ error, reset }) => (
          <ErrorState
            error={worldLoadError}
            diagnostics={error?.stack ?? String(error)}
            onRetry={() => {
              if (!loaded()) setLoadStage("engine");
              silentRetries.current = 0;
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
          onContextLost={() => rebuild()}
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
