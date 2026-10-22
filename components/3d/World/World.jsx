"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { palette } from "@/lib/design/tokens";
import { PROFILES, effectiveDpr } from "@/lib/performance/profiles";
import { usePerformanceStore } from "@/store/performanceStore";
import { TIME_OF_DAY, timeOfDayFor } from "@/lib/world/timeOfDay";
import { ThirdPersonCamera } from "../Camera/ThirdPersonCamera";
import { DecorLayer } from "../Decor/DecorLayer";
import { PetLayer } from "../Pet/PetLayer";
import { Lighting } from "../Environment/Lighting";
import { LocalPlayer } from "../Player/LocalPlayer";
import { RemotePlayer } from "../Player/RemotePlayer";
import { FrameDriver } from "./FrameDriver";
import { Room } from "./Room";

/** Reports once, after the first frame has actually been drawn. */
function FirstFrame({ onRendered }) {
  const done = useRef(false);
  useFrame(() => {
    if (!done.current) {
      done.current = true;
      onRendered();
    }
  });
  return null;
}

/**
 * The 3D world. Composition mirrors the architecture:
 *
 *   World
 *   ├── Lighting            (time-of-day preset)
 *   ├── Room                (room config → shell + objects)
 *   ├── DecorLayer          (what you placed; Decorate's preview)
 *   ├── PetLayer            (your dog)
 *   ├── LocalPlayer         (input, collision, presence send, interactions)
 *   ├── RemotePlayer        (presence-driven, interpolated)
 *   └── ThirdPersonCamera
 *
 * Loaded only through WorldStage (dynamic, client-only): three.js is never in
 * the server render or the initial bundle. Other spaces (Range Room, game
 * rooms) will be separate World-level scenes loaded the same way.
 */
export default function World({ runtime, partner, myCharacter, partnerCharacter, reducedMotion, onCreated, onFirstFrame, onContextLost }) {
  // Quality: the tier's profile (lib/performance). Antialiasing and the initial
  // pixel ratio are fixed when the canvas is created; everything else adapts live.
  const tier = usePerformanceStore((state) => state.tier);
  const profile = PROFILES[tier];
  const [created] = useState(() => ({ antialias: profile.antialias, dpr: effectiveDpr(profile.renderScales[0], window.devicePixelRatio) }));
  const timeOfDay = useMemo(
    () => (runtime.room.lighting === "auto" ? timeOfDayFor() : (TIME_OF_DAY[runtime.room.lighting] ?? timeOfDayFor())),
    [runtime.room.lighting],
  );
  const lamp = runtime.room.objects.find((object) => object.type === "floorLamp")?.position;

  useEffect(() => {
    // Development only: lets devtools inspect the world runtime.
    if (process.env.NODE_ENV !== "production") window.__ourPlaceRuntime = runtime;
  }, [runtime]);

  return (
    <Canvas
      dpr={created.dpr}
      frameloop="never"
      shadows="percentage"
      camera={{ fov: 55, near: 0.1, far: 30 }}
      gl={{ antialias: created.antialias, powerPreference: "high-performance" }}
      onCreated={(state) => {
        // Development only: lets us read renderer stats (draw calls, triangles, programs).
        if (process.env.NODE_ENV !== "production") Object.assign(window, { __ourPlaceGl: state.gl, __ourPlaceScene: state.scene });
        // Decorate mode turns taps into floor points with these (lib/room/floorPick.js).
        runtime.view = { camera: state.camera, canvas: state.gl.domElement };
        // The GPU context can be taken away (low memory, screen lock). The stage
        // then rebuilds the canvas with a fresh context instead of freezing.
        state.gl.domElement.addEventListener(
          "webglcontextlost",
          (event) => {
            event.preventDefault();
            onContextLost?.();
          },
          { once: true },
        );
        onCreated?.(state);
      }}
      fallback={<p className="safe-inset">Our Place needs WebGL, which this browser doesn&apos;t support.</p>}
      aria-label="Your living room"
    >
      <FrameDriver runtime={runtime} />
      <fog attach="fog" args={[palette.black950, 9, 20]} />
      <Lighting timeOfDay={timeOfDay} lampPosition={lamp} shadows={profile.shadows} />
      <Room room={runtime.room} timeOfDay={timeOfDay} reducedMotion={reducedMotion || profile.environment === "static"} runtime={runtime} />
      <DecorLayer />
      <PetLayer runtime={runtime} reducedMotion={reducedMotion} />
      <LocalPlayer runtime={runtime} character={myCharacter} reducedMotion={reducedMotion} />
      <RemotePlayer runtime={runtime} profile={partner} character={partnerCharacter} reducedMotion={reducedMotion} />
      <ThirdPersonCamera runtime={runtime} />
      <FirstFrame onRendered={onFirstFrame} />
    </Canvas>
  );
}
